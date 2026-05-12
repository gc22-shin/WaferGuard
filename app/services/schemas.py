from typing import Literal

from pydantic import BaseModel, Field


DefectType = Literal[
    "Center",
    "Donut",
    "Edge-Loc",
    "Edge-Ring",
    "Loc",
    "Random",
    "Scratch",
    "Near-full",
    "None",
]


class InspectRequest(BaseModel):
    wafer_id: str = Field(default="WF-DEMO-001", min_length=2, max_length=64)
    line_id: str = Field(default="LINE-7", min_length=2, max_length=64)
    equipment_id: str = Field(default="ETCH-02", min_length=2, max_length=64)
    defect_hint: DefectType | Literal["auto"] = "auto"
    operator_note: str = Field(default="", max_length=500)


class ReviewRequest(BaseModel):
    decision: Literal["approved", "needs_review", "false_alarm"]
    reviewer: str = Field(default="engineer", min_length=1, max_length=64)
    note: str = Field(default="", max_length=500)


class DriftRequest(BaseModel):
    intensity: Literal["normal", "mild", "strong"] = "strong"
    line_id: str = Field(default="LINE-7", min_length=2, max_length=64)


class RetrainRequest(BaseModel):
    trigger_type: Literal["scheduled", "drift", "performance", "manual"] = "manual"


class PromoteRequest(BaseModel):
    version: str | None = None


class RollbackRequest(BaseModel):
    reason: str = Field(default="F1 score degradation alarm", max_length=300)


class HandoffReportRequest(BaseModel):
    shift_from: Literal["day", "swing", "night"] = "day"
    shift_to: Literal["day", "swing", "night"] = "night"
    line_id: str = Field(default="ALL", min_length=2, max_length=64)
    operator: str = Field(default="shift-lead", min_length=1, max_length=64)
    note: str = Field(default="", max_length=700)
