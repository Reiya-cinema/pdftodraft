from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from typing import List, Dict
import unicodedata
import pandas as pd
import io
from .models import DraftConfig, get_db
from jinja2 import Template
from pydantic import BaseModel

router = APIRouter()

def normalize_match_text(value: str) -> str:
    # NFKC normalization makes full-width/half-width differences comparable.
    normalized = unicodedata.normalize("NFKC", value or "")
    # Ignore both half-width and full-width spaces for filename matching.
    return normalized.replace(" ", "").replace("\u3000", "")

class DraftReviewItem(BaseModel):
    filename: str
    status: str # "success" | "error"
    layout_name: str
    company_name: str
    department: str
    name: str
    honorific: str
    to_email: str
    cc_email: str
    subject: str
    body: str
    error_message: str = ""

@router.post("/api/analyze-pdfs", response_model=List[DraftReviewItem])
async def analyze_pdfs(
    files: List[UploadFile] = File(...),
    layout_name: str = Form(...),
    db: Session = Depends(get_db)
):
    configs = db.query(DraftConfig).filter(DraftConfig.layout_name == layout_name).all()
    results = []

    for file in files:
        filename = file.filename
        normalized_filename = normalize_match_text(filename)
        matched_config = None
        for config in configs:
            if normalize_match_text(config.pdf_filename_keyword) in normalized_filename:
                matched_config = config
                break
        
        if matched_config:
            context = {
                "company_name": matched_config.company_name or "",
                "department": matched_config.department or "",
                "name": matched_config.name or "",
                "honorific": matched_config.honorific or "様",
                "to_email": matched_config.to_email or "",
                "cc_email": matched_config.cc_email or "",
            }
            
            try:
                template = Template(matched_config.body_template or "")
                body_text = template.render(context)
                
                results.append(DraftReviewItem(
                    filename=filename,
                    status="success",
                    layout_name=layout_name,
                    company_name=matched_config.company_name or "",
                    department=matched_config.department or "",
                    name=matched_config.name or "",
                    honorific=matched_config.honorific or "",
                    to_email=matched_config.to_email or "",
                    cc_email=matched_config.cc_email or "",
                    subject="書類送付のご案内", # Default subject
                    body=body_text
                ))
            except Exception as e:
                results.append(DraftReviewItem(
                    filename=filename,
                    status="error",
                    layout_name=layout_name,
                    company_name="", department="", name="", honorific="", to_email="", cc_email="", subject="", body="",
                    error_message=f"テンプレート展開エラー: {str(e)}"
                ))
        else:
            results.append(DraftReviewItem(
                filename=filename,
                status="error",
                layout_name=layout_name,
                company_name="", department="", name="", honorific="", to_email="", cc_email="", subject="", body="",
                error_message="一致する設定が見つかりませんでした"
            ))
            
    return results
