from typing import List
from pydantic import BaseModel

# Models

class Message(BaseModel):
    message: str

class MessageEntry(BaseModel):
    message: str
    role: str

class SessionData(BaseModel):
    session_id: str
    message_history: List[MessageEntry]

class SummaryRequest(BaseModel):
    session_id: str
    message_history: List[MessageEntry]

class SaveRequest(BaseModel):
    session_id: str
    message_history: List[MessageEntry]
    contexts: List[dict]
    summary: str
