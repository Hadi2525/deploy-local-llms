import json
import os
from uuid import uuid4

from dotenv import find_dotenv, load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.security import APIKeyHeader
from pymongo import MongoClient

# Import the updated schema
from app.schema import Message, SessionData, SummaryRequest, SaveRequest, MessageEntry

from app.chain_config import get_graph
from app.collection_config import get_query_results

# Load environment variables
load_dotenv(find_dotenv(), override=True)
CONN_STRING = os.getenv("CONN_STRING2")
if not CONN_STRING:
    raise RuntimeError("Database connection string (CONN_STRING2) is not set.")

# Initialize FastAPI app
app = FastAPI()

# Mount static files from the "app/client/static" folder.
app.mount("/static", StaticFiles(directory="app/client/static"), name="static")

# Set up Jinja2 templates (index.html is stored in "app/client")
templates = Jinja2Templates(directory="app/client")

# MongoDB connection
try:
    client = MongoClient(CONN_STRING)
    db = client["ai_chatbot"]
    chat_collection = db["chat_history"]
except Exception as e:
    raise RuntimeError(f"Failed to connect to MongoDB: {e}")

# API Key authentication
API_KEY_NAME = "Authorization"
api_key_header = APIKeyHeader(name=API_KEY_NAME)
VALID_API_KEYS = {"full-stack-ai-lab", "secret-key", "admin-key"}


def validate_api_key(api_key: str = Depends(api_key_header)):
    """Validate the API key."""
    if api_key not in VALID_API_KEYS:
        raise HTTPException(status_code=403, detail="Invalid API Key")
    return api_key


def save_to_database(session_id: str, data: dict):
    """Save the session data to the database."""
    try:
        result = chat_collection.update_one({"session_id": session_id}, {"$set": data})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Session not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


# ---------------------------
# API Endpoints
# ---------------------------

@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    """
    Serve the index.html file on the root GET request.
    The HTML file references CSS/JS via the "/static" path.
    """
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return FileResponse("app/client/static/images/favicon.ico")


@app.post("/get_session_id")
def get_session_id():
    """Generate a new session ID."""
    session_id = str(uuid4())
    try:
        # Initialize an empty message history for the session.
        chat_collection.insert_one({"session_id": session_id, "message_history": []})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    return {"session_id": session_id}


@app.post("/ask")
async def ask(session_id: str, message: Message):
    """
    Handle user questions. This endpoint now appends both the user message
    and a generated bot message to the session's message history.
    """
    try:
        chat = chat_collection.find_one({"session_id": session_id})
        if not chat:
            raise HTTPException(status_code=404, detail="Session not found")
        chat_history = chat["message_history"]

        # Append the user's message.
        user_entry = {"message": message.message, "role": "user"}
        chat_history.append(user_entry)

        # Generate a bot response.
        # (Replace this sample logic with your actual bot/LLM call if needed.)
        bot_text = f"Bot: I have received your message: '{message.message}'."
        bot_entry = {"message": bot_text, "role": "bot"}
        chat_history.append(bot_entry)

        # Update the session's message history in the database.
        chat_collection.update_one(
            {"session_id": session_id}, {"$set": {"message_history": chat_history}}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    return {
        "message": "Message received",
        "session_id": session_id,
        "bot_response": bot_text,
    }


@app.post("/retrieve_contexts")
def retrieve_contexts(message: str):
    """Retrieve contexts from the vector store."""
    try:
        retrieved_contexts = get_query_results(message)
        return {"contexts": retrieved_contexts, "message_history": message}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Context retrieval error: {e}")


@app.post("/generate_summary")
async def generate_summary(
    request: SummaryRequest, api_key: str = Depends(validate_api_key)
):
    """
    Generate a summary based on retrieved contexts and message history.
    Note: With the updated schema, message_history is a list of MessageEntry,
    so we extract the text from the first entry.
    """
    try:
        chat = chat_collection.find_one({"session_id": request.session_id})
        if not chat:
            raise HTTPException(status_code=404, detail="Session not found")
        if not request.message_history:
            raise HTTPException(status_code=400, detail="Message history is empty")
        # Extract the text of the first message.
        question = request.message_history[0].message

        graph = get_graph()
        response = await graph.ainvoke({"question": question})
        contexts_dict = [doc.dict() for doc in response.get("context")]

        return {
            "session_id": request.session_id,
            "summary": json.dumps(response.get("answer")),
            "retrieved_contexts": contexts_dict,
            "question": question,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summary generation error: {e}")


@app.post("/get_session_history")
def get_session_history(session_id: str):
    """Retrieve the session history."""
    try:
        chat = chat_collection.find_one({"session_id": session_id})
        if not chat:
            raise HTTPException(status_code=404, detail="Session not found")
        message_history = chat["message_history"]
        return {"message_history": message_history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@app.post("/save_record")
def save_record(request: SaveRequest):
    """Save session summary in the database."""
    try:
        chat = chat_collection.find_one({"session_id": request.session_id})
        if not chat:
            raise HTTPException(status_code=404, detail="Session not found")
        message_history = chat["message_history"]
        save_to_database(
            request.session_id,
            {"message_history": message_history, "summary": request.summary},
        )
        return {"message": "Session data saved", "session_id": request.session_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000)
