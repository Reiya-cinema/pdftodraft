import io
import zipfile
import csv
import logging
import unicodedata
import os
from urllib.parse import quote
from typing import List, Optional
from email import policy
from fastapi import FastAPI, Depends, UploadFile, File, HTTPException, Form
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict
import pandas as pd
from email.message import EmailMessage
from email.header import Header
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, formatdate, make_msgid, parseaddr
from io import BytesIO

from backend.models import Base, DraftConfig, LayoutSetting, SessionLocal, engine, init_db, get_db

# Initialize DB
init_db()

app = FastAPI()

# 開発環境用にCORSを設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    for index_path in ("static/index.html", "dist/index.html"):
        if os.path.exists(index_path):
            return FileResponse(index_path)
    return {"message": "Hello World. This is the API server. For the frontend, please visit http://localhost:5173"}

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
    sender_email: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class ConfigUpdate(BaseModel):
    id: Optional[int]
    layout_name: str
    pdf_filename_keyword: str
    company_name: Optional[str] = ""
    department: Optional[str] = ""
    name: Optional[str] = ""
    honorific: Optional[str] = "様"
    to_email: Optional[str] = ""
    cc_email: Optional[str] = ""
    body_template: Optional[str] = ""

class LayoutSettingOut(BaseModel):
    layout_name: str
    sender_email: Optional[str] = ""

    model_config = ConfigDict(from_attributes=True)

class LayoutSettingUpdate(BaseModel):
    sender_email: Optional[str] = ""

class ImportResult(BaseModel):
    success: bool
    total_processed: int
    errors: List[dict]

# --- API Endpoints ---

@app.get("/api/info")
def read_info():
    return {"app": "pdftodraft", "version": "1.0.0"}

def normalize_sender_email(value: Optional[str]) -> str:
    if not value:
        return ""
    return str(value).strip()

def resolve_from_header(value: Optional[str]) -> str:
    sender_email = normalize_sender_email(value)
    if not sender_email:
        return "sender@example.com"

    display_name, address = parseaddr(sender_email)
    if address:
        return formataddr((display_name, address)) if display_name else address
    return sender_email

def resolve_message_id_domain(from_header: str) -> Optional[str]:
    _, address = parseaddr(from_header)
    if "@" not in address:
        return None
    return address.split("@", 1)[1]

def normalize_match_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value or "")
    return normalized.replace(" ", "").replace("\u3000", "")

def get_or_create_layout_setting(layout_name: str, db: Session) -> LayoutSetting:
    layout_setting = db.query(LayoutSetting).filter(LayoutSetting.layout_name == layout_name).first()
    if layout_setting:
        return layout_setting

    layout_setting = LayoutSetting(layout_name=layout_name, sender_email="")
    db.add(layout_setting)
    db.commit()
    db.refresh(layout_setting)
    return layout_setting

@app.get("/api/layout-settings/{layout_name}", response_model=LayoutSettingOut)
def get_layout_setting(layout_name: str, db: Session = Depends(get_db)):
    return get_or_create_layout_setting(layout_name, db)

@app.put("/api/layout-settings/{layout_name}", response_model=LayoutSettingOut)
def update_layout_setting(layout_name: str, payload: LayoutSettingUpdate, db: Session = Depends(get_db)):
    sender_email = normalize_sender_email(payload.sender_email)
    if sender_email and "@" not in parseaddr(sender_email)[1]:
        raise HTTPException(status_code=400, detail="sender_emailの形式が不正です")

    layout_setting = get_or_create_layout_setting(layout_name, db)
    layout_setting.sender_email = sender_email
    db.commit()
    db.refresh(layout_setting)
    return layout_setting

@app.put("/api/configs/{config_id}", response_model=ConfigOut)
def update_config(config_id: int, config: ConfigUpdate, db: Session = Depends(get_db)):
    db_config = db.query(DraftConfig).filter(DraftConfig.id == config_id).first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Config not found")

    layout_setting = get_or_create_layout_setting(config.layout_name, db)
    
    # Update fields
    db_config.layout_name = config.layout_name
    db_config.pdf_filename_keyword = config.pdf_filename_keyword
    db_config.company_name = config.company_name
    db_config.department = config.department
    db_config.name = config.name
    db_config.honorific = config.honorific
    db_config.to_email = config.to_email
    db_config.cc_email = config.cc_email
    db_config.body_template = config.body_template
    
    try:
        db.commit()
        db.refresh(db_config)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

    db_config.sender_email = layout_setting.sender_email
    return db_config

@app.delete("/api/configs/{config_id}")
def delete_config(config_id: int, db: Session = Depends(get_db)):
    db_config = db.query(DraftConfig).filter(DraftConfig.id == config_id).first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Config not found")
    
    try:
        db.delete(db_config)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
        
    return {"message": "Config deleted successfully"}

@app.get("/api/configs", response_model=List[ConfigOut])
def get_configs(layout_name: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(DraftConfig)
    if layout_name:
        query = query.filter(DraftConfig.layout_name == layout_name)
    configs = query.all()

    sender_lookup = {
        item.layout_name: item.sender_email or ""
        for item in db.query(LayoutSetting).all()
    }
    for config in configs:
        config.sender_email = sender_lookup.get(config.layout_name, "")
    return configs

@app.get("/api/template-csv")
def get_template_csv(layout_name: Optional[str] = None, db: Session = Depends(get_db)):
    headers = [
        "layout_name", "pdf_filename_keyword", "company_name", 
        "department", "name", "honorific", "to_email", "cc_email", "body_template"
    ]
    # Create a CSV in memory with shift-jis encoding (common for Excel in Japan)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)

    if layout_name:
        configs = db.query(DraftConfig).filter(DraftConfig.layout_name == layout_name).all()
        for c in configs:
            writer.writerow([
                c.layout_name, c.pdf_filename_keyword, c.company_name,
                c.department, c.name, c.honorific, c.to_email, c.cc_email, c.body_template
            ])

    # If no data and no layout specified, you might want a sample row, 
    # but the user requested "header only" if nothing is there.
    # So we do nothing else.
    
    csv_string = output.getvalue()
    # Use errors='replace' or 'ignore' to prevent crash on unencodable characters
    csv_bytes = csv_string.encode('shift_jis', errors='replace')
    
    filename = f"{layout_name}.csv" if layout_name else "template.csv"
    encoded_filename = quote(filename)
    content_disposition = f"attachment; filename*=UTF-8''{encoded_filename}"

    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": content_disposition}
    )

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

    # Normalize column names (strip whitespace)
    df.columns = df.columns.astype(str).str.strip()
    
    # Check headers
    missing_cols = [col for col in required_columns if col not in df.columns]
    if missing_cols:
        return {"success": False, "total_processed": 0, "errors": [{"line": 0, "error": f"必須カラムが不足しています: {', '.join(missing_cols)}", "value": ""}]}

    def normalize_emails(val):
        if pd.isna(val):
            return ""
        s = str(val).strip()
        if not s:
            return ""
        # Replace common delimiters with comma
        s = s.replace('、', ',').replace('；', ',').replace(';', ',').replace('\n', ',').replace('\r', ',')
        # Split by comma and strip each part to remove surrounding spaces
        parts = [e.strip() for e in s.split(',') if e.strip()]
        return ', '.join(parts)

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
        to_email = normalize_emails(row['to_email'])
        cc_email = normalize_emails(row.get('cc_email', ''))

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
            "cc_email": cc_email,
            "body_template": str(row['body_template']) if not pd.isna(row['body_template']) else ""
        }

        try:
            get_or_create_layout_setting(layout, db)
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

import json

@app.post("/api/generate-drafts")
async def generate_drafts(
    files: List[UploadFile] = File(...),
    layout_name: str = Form(...),
    overrides: str = Form(None), # JSON string: { filename: {subject, body, to, cc} }
    db: Session = Depends(get_db)
):
    zip_buffer = io.BytesIO()
    layout_setting = get_or_create_layout_setting(layout_name, db)
    from_header = resolve_from_header(layout_setting.sender_email)
    message_id_domain = resolve_message_id_domain(from_header)
    
    # Parse overrides if present
    override_map = {}
    if overrides:
        try:
            override_map = json.loads(overrides)
        except json.JSONDecodeError:
            pass

    # Pre-fetch all configs for the layout to minimize DB hits
    configs = db.query(DraftConfig).filter(DraftConfig.layout_name == layout_name).all()
    
    generated_count = 0
    
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for file in files:
            filename = file.filename
            normalized_filename = normalize_match_text(filename)
            file_content = await file.read()
            
            # Find matching config
            matched_config = None
            for config in configs:
                if normalize_match_text(config.pdf_filename_keyword) in normalized_filename:
                    matched_config = config
                    break
            
            if matched_config or (filename in override_map):
                # Compile Template
                try:
                    # Check if overridden
                    ov = override_map.get(filename)
                    
                    if ov:
                        # Use overridden values directly
                        body_text = ov.get('body', "")
                        subject = ov.get('subject', "書類送付のご案内")
                        to_email = ov.get('to_email', "")
                        cc_email = ov.get('cc_email', "")
                    elif matched_config:
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
                        subject = "書類送付のご案内"
                        to_email = matched_config.to_email or ""
                        cc_email = matched_config.cc_email or ""
                    else:
                        # Should not happen given the if condition, but safety
                        continue

                    # Create EML
                    msg = MIMEMultipart()
                    msg['X-Unsent'] = '1'  # Open as draft in Outlook
                    msg['X-Mozilla-Status'] = '0000' # Open as draft in Thunderbird
                    msg['Content-Class'] = 'urn:content-classes:message'  # Improves Outlook draft detection
                    msg['Date'] = formatdate(localtime=True)
                    msg['Message-ID'] = make_msgid(domain=message_id_domain)
                    msg['Subject'] = Header(subject or "", 'utf-8').encode()
                    msg['From'] = from_header
                    msg['To'] = to_email
                    msg['Cc'] = cc_email
                    msg['Reply-To'] = from_header
                    
                    # Attach Body
                    msg.attach(MIMEText(body_text, 'plain', 'utf-8'))
                    
                    # Attach PDF
                    part = MIMEApplication(file_content, _subtype='pdf')
                    part.add_header(
                        'Content-Disposition',
                        'attachment',
                        filename=('utf-8', '', filename),
                    )
                    msg.attach(part)
                    
                    # Write to zip
                    eml_filename = f"{filename}.eml"
                    # Use SMTP policy to force CRLF line endings for better Outlook compatibility.
                    zip_file.writestr(eml_filename, msg.as_bytes(policy=policy.SMTP))
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

from backend.analyze_router import router as analyze_router
app.include_router(analyze_router)

# Serve Frontend (Catch-all for SPA)
# Keep this after API router registration so /api/* is always handled by FastAPI routes.
frontend_dir = "static" if os.path.exists("static") else ("dist" if os.path.exists("dist") else None)
if frontend_dir:
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
