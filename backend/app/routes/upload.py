from fastapi import APIRouter, File, UploadFile, HTTPException, Depends
from fastapi.responses import FileResponse
from app.core.auth import get_current_user
from app.models.user import User
from app.utils.file_upload import save_upload_file, get_file_path, get_file_size
from pathlib import Path

router = APIRouter()
public_router = APIRouter()

# Legacy uploads directory (for backwards compatibility)
LEGACY_UPLOAD_DIR = Path(__file__).parent.parent / "schemas" / "uploads"

def get_file_type(filename: str) -> str:
    """Determine file type for legacy compatibility."""
    ext = Path(filename).suffix.lower()
    image_exts = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}
    video_exts = {'.mp4', '.mov', '.avi', '.webm'}
    document_exts = {'.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt'}
    audio_exts = {'.mp3', '.wav', '.ogg', '.m4a'}
    
    if ext in image_exts:
        return 'image'
    elif ext in video_exts:
        return 'video'
    elif ext in audio_exts:
        return 'audio'
    return 'document'

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Upload a file (attachment)."""
    try:
        file_type = get_file_type(file.filename)
        
        # Save file to organized directory structure
        file_path, relative_url = save_upload_file(file, category='attachment')
        
        # Get file size
        file_size_str = get_file_size(file_path)
        
        return {
            "url": relative_url,
            "filename": file.filename,
            "size": file_size_str,
            "type": file_type
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")


@router.post("/profile-image")
async def upload_profile_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Upload a profile image."""
    try:
        # Check if file is an image
        file_type = get_file_type(file.filename)
        if file_type not in ['image']:
            raise HTTPException(status_code=400, detail="Only image files are allowed for profile pictures")
        
        # Save file to profile_images directory
        file_path, relative_url = save_upload_file(file, category='profile')
        
        # Get file size
        file_size_str = get_file_size(file_path)
        
        return {
            "url": relative_url,
            "filename": file.filename,
            "size": file_size_str,
            "type": file_type
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Profile image upload failed: {str(e)}")

@public_router.get("/file/{path:path}")
async def get_file(path: str):
    """
    Serve files from uploads directory with path support.
    Example: /api/uploads/file/uploads/profile_images/image.jpg
    """
    if not path or ".." in path:
        raise HTTPException(status_code=400, detail="Invalid path")
    
    # Construct full file path
    file_path = get_file_path(f"/{path}")
    
    # If not found, try legacy location for backwards compatibility
    if not file_path:
        # Extract just the filename from path
        filename = path.split('/')[-1] if '/' in path else path
        legacy_path = LEGACY_UPLOAD_DIR / filename
        if legacy_path.exists() and legacy_path.is_file():
            file_path = legacy_path
        else:
            raise HTTPException(status_code=404, detail=f"File not found: {path}")
    
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    
    # Determine media type
    ext = file_path.suffix.lower()
    media_type_map = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.webm': 'video/webm',
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.txt': 'text/plain',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
    }
    media_type = media_type_map.get(ext, 'application/octet-stream')
    
    return FileResponse(
        file_path,
        media_type=media_type,
        filename=file_path.name,
        headers={
            "Cache-Control": "public, max-age=31536000",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET",
            "Access-Control-Allow-Headers": "*"
        }
    )

