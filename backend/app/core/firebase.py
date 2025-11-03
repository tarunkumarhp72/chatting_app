# Handle optional Firebase imports
try:
    import firebase_admin
    from firebase_admin import credentials, auth, messaging
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False
    print("Firebase SDK not available. Running in mock mode.")
    firebase_admin = None
    credentials = None
    auth = None
    messaging = None
import os
import json

class FirebaseService:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(FirebaseService, cls).__new__(cls)
            cls._instance._initialize_firebase()
        return cls._instance
    
    def _initialize_firebase(self):
        """Initialize Firebase Admin SDK"""
        if not FIREBASE_AVAILABLE:
            print("Firebase not available, running in mock mode")
            return
            
        try:
            # Try to initialize with default credentials (for Firebase Emulator or GCP)
            firebase_admin.initialize_app()
        except ValueError:
            # If that fails, try to initialize with service account key
            try:
                # Get Firebase credentials from environment variables
                private_key = os.getenv("FIREBASE_PRIVATE_KEY")
                if private_key:
                    private_key = private_key.replace('\\n', '\n')
                
                firebase_config = {
                    "type": "service_account",
                    "project_id": os.getenv("FIREBASE_PROJECT_ID"),
                    "private_key_id": os.getenv("FIREBASE_PRIVATE_KEY_ID"),
                    "private_key": private_key,
                    "client_email": os.getenv("FIREBASE_CLIENT_EMAIL"),
                    "client_id": os.getenv("FIREBASE_CLIENT_ID"),
                    "auth_uri": os.getenv("FIREBASE_AUTH_URI"),
                    "token_uri": os.getenv("FIREBASE_TOKEN_URI"),
                    "auth_provider_x509_cert_url": os.getenv("FIREBASE_AUTH_PROVIDER_X509_CERT_URL"),
                    "client_x509_cert_url": os.getenv("FIREBASE_CLIENT_X509_CERT_URL")
                }
                
                # Remove None values
                firebase_config = {k: v for k, v in firebase_config.items() if v is not None}
                
                # Initialize with service account
                cred = credentials.Certificate(firebase_config)
                firebase_admin.initialize_app(cred)
            except Exception as e:
                print(f"Failed to initialize Firebase: {e}")
                # Initialize with default app (may work in some environments)
                try:
                    firebase_admin.initialize_app()
                except:
                    print("Firebase initialization failed completely")
    
    def verify_token(self, token: str):
        """Verify Firebase ID token"""
        if not FIREBASE_AVAILABLE:
            # Mock verification for development
            return {
                "uid": "mock_user_id",
                "phone_number": "+1234567890",
                "email": "mock@example.com",
                "verified": True
            }
            
        try:
            decoded_token = auth.verify_id_token(token)
            return {
                "uid": decoded_token["uid"],
                "phone_number": decoded_token.get("phone_number"),
                "email": decoded_token.get("email"),
                "verified": True
            }
        except Exception as e:
            raise Exception(f"Invalid token: {str(e)}")
    
    def send_push_notification(self, token: str, title: str, body: str, data: dict = None):
        """Send push notification via FCM"""
        if not FIREBASE_AVAILABLE:
            print(f"Mock notification sent: {title} - {body}")
            return "mock_response"
            
        try:
            message = messaging.Message(
                notification=messaging.Notification(
                    title=title,
                    body=body,
                ),
                token=token,
                data=data or {}
            )
            
            response = messaging.send(message)
            return response
        except Exception as e:
            raise Exception(f"Failed to send notification: {str(e)}")
    
    def send_multicast_notification(self, tokens: list, title: str, body: str, data: dict = None):
        """Send multicast push notification via FCM"""
        if not FIREBASE_AVAILABLE:
            print(f"Mock multicast notification sent to {len(tokens)} devices: {title} - {body}")
            return {"success_count": len(tokens), "failure_count": 0}
            
        try:
            message = messaging.MulticastMessage(
                notification=messaging.Notification(
                    title=title,
                    body=body,
                ),
                tokens=tokens,
                data=data or {}
            )
            
            response = messaging.send_multicast(message)
            return response
        except Exception as e:
            raise Exception(f"Failed to send multicast notification: {str(e)}")

# Create a global instance
firebase_service = FirebaseService()