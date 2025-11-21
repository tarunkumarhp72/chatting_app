from fastapi import FastAPI, Depends, Request, status, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.security import HTTPBearer
from fastapi.staticfiles import StaticFiles
from fastapi.encoders import jsonable_encoder
from app.routes import auth, users, friends, messages, websocket, upload, conversations
from app.db.session import engine, Base
from app.core.auth import get_current_user
from app.models.user import User
from app.utils.file_upload import initialize_directories
from app.utils.logger import safe_print
from dotenv import load_dotenv
from pathlib import Path
import json
import traceback
import sys

load_dotenv()

# Configure UTF-8 encoding for Windows console
if sys.platform == 'win32':
    try:
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        if hasattr(sys.stderr, 'reconfigure'):
            sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except:
        pass

# Custom JSON encoder that preserves Unicode characters (emojis)
class UnicodeJSONResponse(JSONResponse):
    def render(self, content) -> bytes:
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
        ).encode("utf-8")

# Create uploads directory if it doesn't exist
UPLOADS_DIR = Path(__file__).parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

# Initialize upload directories on startup
initialize_directories()


app = FastAPI(
    title="Chatting App API",
    description="WhatsApp-like messaging application API",
    version="1.0.0",
    openapi_tags=[
        {"name": "Authentication", "description": "User authentication endpoints"},
        {"name": "Users", "description": "User management endpoints"},
        {"name": "Friends", "description": "Friend management endpoints"},
        {"name": "Messages", "description": "Message management endpoints"},
        {"name": "Groups", "description": "Group management endpoints"},
        {"name": "Calls", "description": "Call management endpoints"},
        {"name": "WebSocket", "description": "WebSocket endpoints"},
    ],
    # Configure default JSON response class to preserve Unicode
    default_response_class=UnicodeJSONResponse
)

# Mount static files directory for uploads with CORS headers
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

# Add request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming API requests"""
    method = request.method
    url = str(request.url)
    path = request.url.path
    query_params = str(request.query_params) if request.query_params else ""
    
    # Log request
    safe_print("\n" + "="*60)
    safe_print(f"[{method}] {path}")
    if query_params:
        safe_print(f"Query Params: {query_params}")
    safe_print(f"Client: {request.client.host if request.client else 'Unknown'}")
    safe_print("="*60)
    
    # Process request
    response = await call_next(request)
    
    # Log response
    safe_print(f"[{method}] {path} - Status: {response.status_code}")
    safe_print("="*60 + "\n")
    
    return response

# Configure CORS - MUST be added before routes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3003", "http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Global exception handler to ensure CORS headers are included in error responses
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions and ensure CORS headers are included"""
    origin = request.headers.get("origin")
    allowed_origins = ["http://localhost:3003", "http://localhost:3000", "http://localhost:5173"]
    
    headers = {}
    if origin in allowed_origins:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    
    return UnicodeJSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=headers
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle all other exceptions and ensure CORS headers are included"""
    import traceback
    try:
        traceback.print_exc()
    except UnicodeEncodeError:
        safe_print("Traceback contains Unicode - check logs")
    
    origin = request.headers.get("origin")
    allowed_origins = ["http://localhost:3003", "http://localhost:3000", "http://localhost:5173"]
    
    headers = {}
    if origin in allowed_origins:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    
    return UnicodeJSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"},
        headers=headers
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors with CORS headers"""
    origin = request.headers.get("origin")
    allowed_origins = ["http://localhost:3003", "http://localhost:3000", "http://localhost:5173"]
    
    headers = {}
    if origin in allowed_origins:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    
    return UnicodeJSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
        headers=headers
    )



# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])

# Protected routes (require authentication)
app.include_router(users.router, prefix="/api/users", tags=["Users"], dependencies=[Depends(get_current_user)])
app.include_router(friends.router, prefix="/api/friends", tags=["Friends"], dependencies=[Depends(get_current_user)])
app.include_router(conversations.router, prefix="/api/conversations", tags=["Conversations"], dependencies=[Depends(get_current_user)])
app.include_router(messages.router, prefix="/api/messages", tags=["Messages"], dependencies=[Depends(get_current_user)])
# app.include_router(groups.router, prefix="/api/groups", tags=["Groups"], dependencies=[Depends(get_current_user)])
# app.include_router(calls.router, prefix="/api/calls", tags=["Calls"], dependencies=[Depends(get_current_user)])

# Upload router - upload requires auth, but file serving is public
app.include_router(upload.router, prefix="/api/uploads", tags=["Upload"], dependencies=[Depends(get_current_user)])
app.include_router(upload.public_router, prefix="/api/uploads", tags=["Upload"])

app.include_router(websocket.router, prefix="/api", tags=["WebSocket"])

@app.get("/")
async def root():
    return {"message": "Welcome to the Chatting App API"}

@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}

# Run uvicorn server when file is executed directly
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
       
    )