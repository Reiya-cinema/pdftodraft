import io
import zipfile
import csv
import logging
from typing import List, Optional
from fastapi import FastAPI, Depends, UploadFile, File, HTTPException, Form
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from pydantic import BaseModel
import pandas as pd
from email.message import EmailMessage
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from io import BytesIO

from backend.models import Base, DraftConfig, SessionLocal, engine, init_db

# Initialize DB
init_db()

app = FastAPI()

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Pydantic Models
class ConfigOut(BaseModel):
    id: int
    layout_name: str
    pdf_filename_keyword: str
    company_name: Optional[str]
    department: Optional[str]
    name: Optional[str]
    honorific: Optional[str]
    to_email: Optional[str]
    cc_email: Optional[str]
    body_template: Optional[str]

    class Config:
        orm_mode = True

class ImportResult(BaseModel):
    success: bool
    total_processed: int
    errors: List[dict]

# --- API Endpoints ---

@app.get("/api/info")
def read_info():
    return {"app": "pdftodraft", "version": "1.0.0"}

@app.get("/api/configs", response_model=List[ConfigOut])
def get_configs(layout_name: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(DraftConfig)
    if layout_name:
        query = query.filter(DraftConfig.layout_name == layout_name)
    return query.all()

@app.get("/api/layouts")
def get_layouts(db: Session = Depends(get_db)):
    # Get unique layout names
    layouts = db.query(DraftConfig.layout_name).distinct().all()
    return [l[0] for l in layouts]

@app.post("/api/import-csv")
async def import_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    try:
        # Detect encoding (fallback to utf-8 if shift_jis fails, standard excel csv often shift_jis)
        try:
            df = pd.read_csv(io.BytesIO(content), encoding='utf-8')
        except UnicodeDecodeError:
            df = pd.read_csv(io.BytesIO(content), encoding='shift_jis')
    except Exception as e:
        return {"success": False, "total_processed": 0, "errors": [{"line": 0, "error": f"CSV解析エラー: {str(e)}", "value": ""}]}

    required_columns = [
        "layout_name", "pdf_filename_keyword", "company_name", 
        "department", "name", "honorific", "to_email", "cc_email", "body_template"
    ]
    
    # Check headers
    missing_cols = [col for col in required_columns if col not in df.columns]
    if missing_cols:
        return {"success": False, "total_processed": 0, "errors": [{"line": 0, "error": f"必須カラムが不足しています: {', '.join(missing_cols)}", "value": ""}]}

    errors = []
    processed_count = 0

    for index, row in df.iterrows():
        line_num = index + 2  # 1-based, header is line 1
        
        # Validation
        if pd.isna(row['layout_name']) or str(row['layout_name']).strip() == "":
            errors.append({"line": line_num, "error": "layout_nameが必須です", "value": ""})
            continue
        if pd.isna(row['pdf_filename_keyword']) or str(row['pdf_filename_keyword']).strip() == "":
            errors.append({"line": line_num, "error": "pdf_filename_keywordが必須です", "value": ""})
            continue

        # Email validation (simple regex or library)
        to_email = str(row['to_email']).strip() if not pd.isna(row['to_email']) else ""
        if to_email and '@' not in to_email:
             errors.append({"line": line_num, "error": f"to_emailの形式が不正です", "value": to_email})
             continue

        # Create or Update
        layout = str(row['layout_name']).strip()
        keyword = str(row['pdf_filename_keyword']).strip()
        
        existing = db.query(DraftConfig).filter(
            DraftConfig.layout_name == layout,
            DraftConfig.pdf_filename_keyword == keyword
        ).first()

        data = {
            "layout_name": layout,
            "pdf_filename_keyword": keyword,
            "company_name": str(row['company_name']) if not pd.isna(row['company_name']) else "",
            "department": str(row['department']) if not pd.isna(row['department']) else "",
            "name": str(row['name']) if not pd.isna(row['name']) else "",
            "honorific": str(row['honorific']) if not pd.isna(row['honorific']) else "様",
            "to_email": to_email,
            "cc_email": str(row['cc_email']).strip() if not pd.isna(row['cc_email']) else "",
            "body_template": str(row['body_template']) if not pd.isna(row['body_template']) else ""
        }

        try:
            if existing:
                for key, value in data.items():
                    setattr(existing, key, value)
            else:
                new_config = DraftConfig(**data)
                db.add(new_config)
            processed_count += 1
        except Exception as e:
            errors.append({"line": line_num, "error": f"DB保存エラー: {str(e)}", "value": ""})

    db.commit()
    
    return {"success": True, "total_processed": processed_count, "errors": errors}

@app.post("/api/generate-drafts")
async def generate_drafts(
    files: List[UploadFile] = File(...),
    layout_name: str = Form(...),
    db: Session = Depends(get_db)
):
    zip_buffer = io.BytesIO()
    
    # Pre-fetch all configs for the layout to minimize DB hits
    configs = db.query(DraftConfig).filter(DraftConfig.layout_name == layout_name).all()
    # Create a simple lookup map: keyword -> config
    # Since keywords are substrings, we need to iterate. 
    # Optimization: Sort keywords by length desc to match longest first if there's overlap? 
    # Or just find first match. Simplest is linear search for each file.
    
    generated_count = 0
    
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for file in files:
            filename = file.filename
            file_content = await file.read()
            
            # Find matching config
            matched_config = None
            for config in configs:
                if config.pdf_filename_keyword in filename:
                    matched_config = config
                    break
            
            if matched_config:
                # Compile Template
                try:
                    # Variables for template
                    context = {
                        "company_name": matched_config.company_name or "",
                        "department": matched_config.department or "",
                        "name": matched_config.name or "",
                        "honorific": matched_config.honorific or "様",
                        "to_email": matched_config.to_email or "",
                        "cc_email": matched_config.cc_email or "",
                    }
                    
                    from jinja2 import Template
                    template = Template(matched_config.body_template or "")
                    body_text = template.render(context)
                    
                    # Create EML
                    msg = MIMEMultipart()
                    msg['Subject'] = "書類送付のご案内" # Default subject
                    msg['From'] = "sender@example.com" # Placeholder, user will change in mailer
                    msg['To'] = matched_config.to_email or ""
                    msg['Cc'] = matched_config.cc_email or ""
                    
                    # Attach Body
                    msg.attach(MIMEText(body_text, 'plain', 'utf-8'))
                    
                    # Attach PDF
                    part = MIMEApplication(file_content, Name=filename)
                    part['Content-Disposition'] = f'attachment; filename="{filename}"'
                    msg.attach(part)
                    
                    # Write to zip
                    eml_filename = f"{filename}.eml"
                    zip_file.writestr(eml_filename, msg.as_bytes())
                    generated_count += 1
                    
                except Exception as e:
                    logger.error(f"Error processing {filename}: {e}")
                    # Could add error log file to zip
                    zip_file.writestr(f"error_{filename}.txt", str(e))
            else:
                 zip_file.writestr(f"skipped_{filename}.txt", "No matching keyword found in filename.")
    
    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=drafts.zip"}
    )

# Serve Frontend (Catch-all for SPA)
# Checks if static folder exists (in production)
import os
if os.path.exists("static"):
    app.mount("/", StaticFiles(directory="static", html=True), name="static")
else:
    # For local dev without build, just a placeholder or nothing
    pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
