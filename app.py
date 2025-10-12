from twilio.twiml.voice_response import VoiceResponse, Gather, Say, Play, Record, Dial, Pause
from twilio.rest import Client
from functools import wraps
import re
from urllib.parse import urlencode
from flask import Flask, request, jsonify, render_template_string, session, make_response
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup
import phonenumbers
from phonenumbers import NumberParseException
from twilio.rest import Client
import anthropic
import os
import logging
from dotenv import load_dotenv
from difflib import get_close_matches
import json
import time
import base64
import asyncio
from datetime import datetime, timedelta
from typing import Optional, Tuple, Dict, Any, List
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta, timezone
import uuid
import hashlib

# Client Configuration - ADD THIS SECTION
CLIENT_ID = os.getenv('CLIENT_ID', 'default')
CLIENT_NAME = os.getenv('CLIENT_NAME', 'RinglyPro')
CRM_BASE_URL = os.getenv('CRM_BASE_URL', 'https://ringlypro-crm.onrender.com/api')

# Load environment variables
load_dotenv()

# Setup Flask
app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'your-default-secret-key-change-this')
CORS(app, origins="*", allow_headers="*", methods="*")

# Setup Enhanced Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler("ringlypro.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# API Keys validation
anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
openai_api_key = os.getenv("OPENAI_API_KEY")
elevenlabs_api_key = os.getenv("ELEVENLABS_API_KEY")
twilio_account_sid = os.getenv("TWILIO_ACCOUNT_SID")
twilio_auth_token = os.getenv("TWILIO_AUTH_TOKEN")
twilio_phone = os.getenv("TWILIO_PHONE_NUMBER")

# Twilio Webhook Configuration
TWILIO_PHONE_NUMBER = "+18886103810"
TWILIO_WEBHOOK_BASE_URL = os.getenv("WEBHOOK_BASE_URL", "https://voice-bot-r91r.onrender.com")

# CRM Configuration - PostgreSQL Backend
CRM_WEBHOOK_URL = "https://ringlypro-crm.onrender.com/api/calls/webhook/voice"

# Email Configuration
smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
smtp_port = int(os.getenv("SMTP_PORT", "587"))
email_user = os.getenv("EMAIL_USER")
email_password = os.getenv("EMAIL_PASSWORD")
from_email = os.getenv("FROM_EMAIL", email_user)

# HubSpot Configuration
hubspot_api_token = os.getenv("HUBSPOT_ACCESS_TOKEN")
hubspot_portal_id = os.getenv("HUBSPOT_PORTAL_ID")
hubspot_owner_id = os.getenv("HUBSPOT_OWNER_ID")

# Zoom Configuration
zoom_meeting_url = "https://us06web.zoom.us/j/7269045564?pwd=MnR6TXVio652a69JpgaDtMcemiwT9X.1"
zoom_meeting_id = "726 904 5564"
zoom_password = "RinglyPro2024"

# Business Configuration
business_timezone = timezone(timedelta(hours=-5))  # Eastern Time (UTC-5)
business_hours = {
    'monday': {'start': '09:00', 'end': '17:00'},
    'tuesday': {'start': '09:00', 'end': '17:00'},
    'wednesday': {'start': '09:00', 'end': '17:00'},
    'thursday': {'start': '09:00', 'end': '17:00'},
    'friday': {'start': '09:00', 'end': '17:00'},
    'saturday': {'start': '10:00', 'end': '14:00'},
    'sunday': {'start': 'closed', 'end': 'closed'}
}

if not anthropic_api_key:
    logger.error("ANTHROPIC_API_KEY not found in environment variables")
    raise ValueError("ANTHROPIC_API_KEY not found in environment variables")

# ==================== CRM API CONFIGURATION (POSTGRESQL) ====================
CRM_BASE_URL = "https://ringlypro-crm.onrender.com/api"
CRM_HEADERS = {
    'Content-Type': 'application/json',
    'User-Agent': 'Rachel-Voice-AI/2.0'
}

class CRMAPIClient:
    """Client for RinglyPro CRM API integration with PostgreSQL backend"""
    
    def __init__(self):
        self.base_url = CRM_BASE_URL
        self.headers = CRM_HEADERS
        self.timeout = 10
    
    def _make_request(self, method, endpoint, data=None, params=None):
        """Make HTTP request to CRM API with PostgreSQL backend"""
        try:
            url = f"{self.base_url}/{endpoint.lstrip('/')}"
            
            if method.upper() == 'GET':
                response = requests.get(url, headers=self.headers, params=params, timeout=self.timeout)
            elif method.upper() == 'POST':
                response = requests.post(url, headers=self.headers, json=data, timeout=self.timeout)
            elif method.upper() == 'PUT':
                response = requests.put(url, headers=self.headers, json=data, timeout=self.timeout)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")
            
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.Timeout:
            logger.error(f"CRM API timeout for {endpoint}")
            return None
        except requests.exceptions.ConnectionError:
            logger.error(f"CRM API connection error for {endpoint}")
            return None
        except requests.exceptions.HTTPError as e:
            logger.error(f"CRM API HTTP error for {endpoint}: {e.response.status_code}")
            return None
        except Exception as e:
            logger.error(f"CRM API unexpected error for {endpoint}: {e}")
            return None

# Global CRM client instance
crm_client = CRMAPIClient()

def init_crm_connection():
    """Initialize CRM API connection and verify PostgreSQL connectivity"""
    try:
        logger.info("Testing CRM API connection to PostgreSQL...")
        
        # Test CRM API connectivity to PostgreSQL - try multiple endpoints
        result = None
        
        # Try /health endpoint first
        result = crm_client._make_request('GET', '/health')
        
        # If /health fails, try /appointments endpoint
        if not result:
            result = crm_client._make_request('GET', '/appointments')
        
        # If both fail, try the base endpoint
        if not result:
            result = crm_client._make_request('GET', '/')
        
        if result:
            logger.info("CRM API connection to PostgreSQL successful")
            return True
        else:
            logger.warning("CRM API connection failed - will use fallbacks")
            return False
            
    except Exception as e:
        logger.error(f"CRM connection test failed: {e}")
        return False

def log_call_to_crm(call_data: dict):
    """Log call data to PostgreSQL via CRM API"""
    try:
        logger.info(f"Logging call to PostgreSQL: {call_data.get('CallSid', 'Unknown')}")
        
        crm_call_data = {
            'callSid': call_data.get('CallSid'),
            'fromNumber': call_data.get('From'),
            'toNumber': call_data.get('To'),
            'callStatus': call_data.get('CallStatus'),
            'direction': 'inbound',
            'source': 'Rachel-AI-Assistant',
            'notes': call_data.get('notes', 'Call handled by Rachel AI'),
            'speechResult': call_data.get('SpeechResult')
        }
        
        # Send to PostgreSQL via CRM webhook
        result = crm_client._make_request('POST', '/calls/webhook', data=crm_call_data)
        
        if result:
            logger.info("Call logged to PostgreSQL successfully")
        else:
            logger.warning("Call logging to PostgreSQL failed")
            
    except Exception as e:
        logger.warning(f"PostgreSQL call logging error: {e}")

def log_inquiry_to_crm(phone: str, question: str, source: str = "phone"):
    """Log customer inquiry to PostgreSQL via CRM API"""
    try:
        inquiry_data = {
            'customerPhone': phone,
            'inquiry': question,
            'source': source,
            'timestamp': datetime.now().isoformat(),
            'status': 'new'
        }
        
        result = crm_client._make_request('POST', '/inquiries', data=inquiry_data)
        
        if result:
            logger.info(f"Inquiry logged to PostgreSQL: {phone}")
        else:
            logger.warning(f"Inquiry logging to PostgreSQL failed: {phone}")
            
    except Exception as e:
        logger.warning(f"PostgreSQL inquiry logging error: {e}")

def save_customer_inquiry_to_crm(phone: str, question: str, sms_sent: bool, sms_sid: str = "", source: str = "chat") -> bool:
    """Save customer inquiry to PostgreSQL via CRM API"""
    try:
        inquiry_data = {
            'customerPhone': phone,
            'inquiry': question,
            'source': source,
            'timestamp': datetime.now().isoformat(),
            'status': 'new',
            'smsSent': sms_sent,
            'smsSid': sms_sid
        }
        
        result = crm_client._make_request('POST', '/inquiries', data=inquiry_data)
        
        if result:
            logger.info(f"Customer inquiry saved to PostgreSQL: {phone}")
            return True
        else:
            logger.warning(f"Failed to save inquiry to PostgreSQL: {phone}")
            return False
            
    except Exception as e:
        logger.error(f"PostgreSQL save error: {e}")
        return False

# ==================== HUBSPOT SERVICE ====================

class HubSpotService:
    """Enhanced HubSpot CRM integration"""
    
    def __init__(self):
        self.api_token = hubspot_api_token
        self.portal_id = hubspot_portal_id
        self.owner_id = hubspot_owner_id
        self.base_url = "https://api.hubapi.com"
        self.headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json"
        }
        
        if self.api_token:
            logger.info(f"HubSpot service initialized - Token: {self.api_token[:12]}...")
        else:
            logger.warning("HubSpot not configured - missing HUBSPOT_ACCESS_TOKEN")
    
    def test_connection(self) -> Dict[str, Any]:
        """Test HubSpot API connection"""
        if not self.api_token:
            return {"success": False, "error": "HubSpot API token not configured"}
        
        try:
            response = requests.get(
                f"{self.base_url}/crm/v3/objects/contacts",
                headers=self.headers,
                params={"limit": 1},
                timeout=10
            )
            
            if response.status_code == 200:
                return {"success": True, "message": "HubSpot connection successful"}
            else:
                return {"success": False, "error": f"API returned status {response.status_code}: {response.text}"}
                
        except Exception as e:
            return {"success": False, "error": f"Connection failed: {str(e)}"}
    
    def create_contact(self, name: str, email: str = "", phone: str = "", company: str = "") -> Dict[str, Any]:
        """Create or update contact in HubSpot"""
        try:
            # Search for existing contact by email first
            if email:
                existing = self.search_contact_by_email(email)
                if existing.get("success") and existing.get("contact"):
                    return self.update_contact(existing["contact"]["id"], {
                        "firstname": name.split()[0] if name.split() else "",
                        "lastname": " ".join(name.split()[1:]) if len(name.split()) > 1 else "",
                        "phone": phone,
                        "company": company
                    })
            
            # Create new contact
            name_parts = name.strip().split()
            properties = {
                "firstname": name_parts[0] if name_parts else "",
                "lastname": " ".join(name_parts[1:]) if len(name_parts) > 1 else "",
                "email": email,
                "phone": phone,
                "company": company,
                "lifecyclestage": "lead"
            }
            
            # Remove empty values
            properties = {k: v for k, v in properties.items() if v}
            
            contact_data = {"properties": properties}
            
            response = requests.post(
                f"{self.base_url}/crm/v3/objects/contacts",
                headers=self.headers,
                json=contact_data,
                timeout=10
            )
            
            if response.status_code in [200, 201]:
                contact = response.json()
                logger.info(f"HubSpot contact created: {contact.get('id')} - {name}")
                return {
                    "success": True,
                    "message": f"Contact created: {name}",
                    "contact_id": contact.get("id"),
                    "contact": contact
                }
            else:
                logger.error(f"HubSpot contact creation failed: {response.status_code} - {response.text}")
                return {"success": False, "error": f"Failed to create contact: {response.text}"}
                
        except Exception as e:
            logger.error(f"Error creating contact: {str(e)}")
            return {"success": False, "error": f"Error creating contact: {str(e)}"}
    
    def search_contact_by_email(self, email: str) -> Dict[str, Any]:
        """Search for contact by email address"""
        try:
            search_data = {
                "filterGroups": [{
                    "filters": [{
                        "propertyName": "email",
                        "operator": "EQ",
                        "value": email
                    }]
                }],
                "properties": ["email", "firstname", "lastname", "phone", "company"],
                "limit": 1
            }
            
            response = requests.post(
                f"{self.base_url}/crm/v3/objects/contacts/search",
                headers=self.headers,
                json=search_data,
                timeout=10
            )
            
            if response.status_code == 200:
                results = response.json()
                contacts = results.get("results", [])
                
                if contacts:
                    return {
                        "success": True,
                        "contact": contacts[0]
                    }
                else:
                    return {"success": False, "error": f"No contact found with email: {email}"}
            else:
                return {"success": False, "error": f"Search failed: {response.text}"}
                
        except Exception as e:
            return {"success": False, "error": f"Error searching contact: {str(e)}"}
    
    def update_contact(self, contact_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        """Update contact information"""
        try:
            # Remove empty values
            updates = {k: v for k, v in updates.items() if v}
            update_data = {"properties": updates}
            
            response = requests.patch(
                f"{self.base_url}/crm/v3/objects/contacts/{contact_id}",
                headers=self.headers,
                json=update_data,
                timeout=10
            )
            
            if response.status_code == 200:
                return {
                    "success": True,
                    "message": "Contact updated successfully",
                    "contact": response.json()
                }
            else:
                return {"success": False, "error": f"Failed to update contact: {response.text}"}
                
        except Exception as e:
            return {"success": False, "error": f"Error updating contact: {str(e)}"}
    
    def create_meeting(self, title: str, contact_id: str, start_time: datetime, duration_minutes: int = 30) -> Dict[str, Any]:
        """Create meeting using Engagement API"""
        try:
            end_time = start_time + timedelta(minutes=duration_minutes)
            
            meeting_data = {
                "engagement": {
                    "active": True,
                    "type": "MEETING",
                    "timestamp": int(start_time.timestamp() * 1000)
                },
                "associations": {
                    "contactIds": [contact_id] if contact_id else [],
                    "companyIds": [],
                    "dealIds": []
                },
                "metadata": {
                    "title": title,
                    "body": f"Appointment scheduled via RinglyPro Voice Assistant\n\nZoom Details:\n{zoom_meeting_url}\nMeeting ID: {zoom_meeting_id}\nPassword: {zoom_password}",
                    "startTime": int(start_time.timestamp() * 1000),
                    "endTime": int(end_time.timestamp() * 1000),
                    "location": zoom_meeting_url,
                    "meetingOutcome": "SCHEDULED"
                }
            }
            
            response = requests.post(
                "https://api.hubapi.com/engagements/v1/engagements",
                headers=self.headers,
                json=meeting_data,
                timeout=10
            )
            
            if response.status_code in [200, 201]:
                engagement = response.json()
                engagement_id = engagement.get("engagement", {}).get("id")
                
                logger.info(f"Meeting created via Engagement API: {engagement_id}")
                
                return {
                    "success": True,
                    "message": f"Meeting created: {title}",
                    "meeting_id": str(engagement_id),
                    "meeting": engagement
                }
            else:
                logger.error(f"Failed to create meeting: {response.status_code} - {response.text}")
                return {"success": False, "error": f"Failed to create meeting: {response.text}"}
                
        except Exception as e:
            logger.error(f"Error creating meeting: {str(e)}")
            return {"success": False, "error": f"Error creating meeting: {str(e)}"}

# ==================== APPOINTMENT MANAGEMENT CLASS (POSTGRESQL VIA CRM API) ====================

class AppointmentManager:
    """PostgreSQL-based appointment management via CRM API (NO MORE SQLITE)"""
    
    def __init__(self):
        self.hubspot_service = HubSpotService()
        self.crm_client = crm_client
    
    @staticmethod
    def generate_confirmation_code():
        """Generate unique confirmation code"""
        return str(uuid.uuid4())[:8].upper()
    
    def get_available_slots(self, date_str: str, timezone_str: str = 'America/New_York') -> List[str]:
        """Get available appointment slots from PostgreSQL via CRM API"""
        try:
            logger.info(f"Getting available slots from PostgreSQL for {date_str}")
            
            data = {
                'date': date_str
            }
            
            result = self.crm_client._make_request('POST', '/appointments/available-slots', data=data)
            
            if result and result.get('success'):
                slots = result.get('slots', [])
                logger.info(f"Got {len(slots)} available slots from PostgreSQL")
                return slots
            else:
                logger.warning("PostgreSQL API failed, falling back to default slots")
                return self._get_fallback_slots(date_str)
                
        except Exception as e:
            logger.error(f"Error getting slots from PostgreSQL: {e}")
            return self._get_fallback_slots(date_str)
    
    def _get_fallback_slots(self, date_str: str) -> List[str]:
        """Fallback slot generation when PostgreSQL API is unavailable"""
        try:
            target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            day_name = target_date.strftime('%A').lower()
            
            if day_name not in business_hours or business_hours[day_name]['start'] == 'closed':
                return []
            
            basic_slots = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', 
                          '14:00', '14:30', '15:00', '15:30', '16:00', '16:30']
            
            if target_date == datetime.now().date():
                current_hour = datetime.now().hour
                return [slot for slot in basic_slots if int(slot.split(':')[0]) > current_hour]
            
            return basic_slots
            
        except Exception as e:
            logger.error(f"Fallback slots error: {e}")
            return ['10:00', '14:00', '15:00']
    
    def is_slot_available(self, date_str: str, time_str: str) -> bool:
        """Check if slot is available via PostgreSQL API"""
        try:
            available_slots = self.get_available_slots(date_str)
            return time_str in available_slots
        except Exception as e:
            logger.error(f"Error checking slot availability: {e}")
            return True
    
    def book_appointment(self, customer_data: dict) -> Tuple[bool, str, dict]:
        """Book appointment via PostgreSQL API (NO MORE SQLITE)"""
        try:
            confirmation_code = self.generate_confirmation_code()
            logger.info(f"Starting PostgreSQL appointment booking with code: {confirmation_code}")
            
            # Validate required fields
            required_fields = ['name', 'email', 'phone', 'date', 'time']
            for field in required_fields:
                if not customer_data.get(field):
                    logger.error(f"Missing required field: {field}")
                    return False, f"Missing required field: {field}", {}
            
            # Format phone number
            phone_input = customer_data['phone']
            phone_digits = re.sub(r'\D', '', phone_input)
            
            if len(phone_digits) == 10:
                formatted_phone = f"+1{phone_digits}"
            elif len(phone_digits) == 11 and phone_digits[0] == '1':
                formatted_phone = f"+{phone_digits}"
            else:
                logger.error(f"Invalid phone format: {phone_input}")
                return False, "Invalid phone number format", {}
            
            logger.info(f"Formatted phone: {phone_input} -> {formatted_phone}")
            
            # Prepare data for PostgreSQL via CRM API
            crm_appointment_data = {
                'customerName': customer_data['name'],
                'customerEmail': customer_data['email'],
                'customerPhone': formatted_phone,
                'appointmentDate': customer_data['date'],
                'appointmentTime': customer_data['time'],
                'purpose': customer_data.get('purpose', 'Phone consultation via Rachel AI'),
                'confirmationCode': confirmation_code,
                'source': 'voice_booking',
                'duration': 30
            }
            
            # Send to PostgreSQL via CRM API
            logger.info("Sending appointment to PostgreSQL database...")
            result = self.crm_client._make_request('POST', '/appointments', data=crm_appointment_data)
            
            if result and result.get('success'):
                logger.info("Appointment successfully created in PostgreSQL database")
                crm_appointment = result.get('appointment', {})
                
                # Create response appointment object
                appointment = {
                    'id': crm_appointment.get('id'),
                    'confirmation_code': confirmation_code,
                    'customer_name': customer_data['name'],
                    'customer_email': customer_data['email'],
                    'customer_phone': formatted_phone,
                    'date': customer_data['date'],
                    'time': customer_data['time'],
                    'purpose': customer_data.get('purpose', 'Phone consultation via Rachel AI'),
                    'zoom_url': zoom_meeting_url,
                    'zoom_id': zoom_meeting_id,
                    'zoom_password': zoom_password
                }
                
                # Send confirmations
                confirmation_results = self.send_appointment_confirmations(appointment)
                
                logger.info(f"Appointment booked: {confirmation_code}")
                
                return True, "Appointment booked successfully in PostgreSQL", appointment
                
            else:
                logger.error("PostgreSQL API failed to create appointment")
                return False, "Failed to book appointment in PostgreSQL system", {}
                
        except Exception as e:
            logger.error(f"Critical error booking appointment via PostgreSQL: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False, f"Booking error: {str(e)}", {}
    
    def get_appointment_by_code(self, confirmation_code: str) -> Optional[dict]:
        """Get appointment by confirmation code from PostgreSQL API"""
        try:
            logger.info(f"Looking up appointment {confirmation_code} in PostgreSQL")
            
            result = self.crm_client._make_request('GET', f'/appointments/confirmation/{confirmation_code}')
            
            if result and result.get('success'):
                appointment = result.get('appointment', {})
                logger.info(f"Found appointment in PostgreSQL: {appointment.get('customerName', 'Unknown')}")
                return appointment
            else:
                logger.warning(f"Appointment {confirmation_code} not found in PostgreSQL")
                return None
                
        except Exception as e:
            logger.error(f"Error getting appointment from PostgreSQL: {e}")
            return None
    
    @staticmethod
    def send_appointment_confirmations(appointment: dict) -> dict:
        """Send email and SMS confirmations"""
        results = {'email': 'Failed', 'sms': 'Failed'}
        
        try:
            email_result = AppointmentManager.send_email_confirmation(appointment)
            results['email'] = 'Sent' if email_result else 'Failed'
            
            sms_result = AppointmentManager.send_sms_confirmation(appointment)
            results['sms'] = 'Sent' if sms_result else 'Failed'
            
        except Exception as e:
            logger.error(f"Error in send_appointment_confirmations: {e}")
        
        return results
    
    @staticmethod
    def send_email_confirmation(appointment: dict) -> bool:
        """Send detailed email confirmation"""
        try:
            if not all([email_user, email_password]):
                logger.warning("Email credentials not configured")
                return False
            
            logger.info(f"Attempting to send email to: {appointment['customer_email']}")
            
            date_obj = datetime.strptime(appointment['date'], '%Y-%m-%d')
            formatted_date = date_obj.strftime('%A, %B %d, %Y')
            
            time_obj = datetime.strptime(appointment['time'], '%H:%M')
            formatted_time = time_obj.strftime('%I:%M %p')
            
            subject = f"RinglyPro Appointment Confirmation - {formatted_date}"
            
            body = f"""
Dear {appointment['customer_name']},

Your appointment with RinglyPro has been successfully scheduled!

APPOINTMENT DETAILS:
- Date: {formatted_date}
- Time: {formatted_time} EST
- Duration: 30 minutes
- Purpose: {appointment['purpose']}
- Confirmation Code: {appointment['confirmation_code']}

ZOOM MEETING DETAILS:
- Meeting Link: {appointment['zoom_url']}
- Meeting ID: {appointment['zoom_id']}
- Password: {appointment['zoom_password']}

WHAT TO EXPECT:
Our team will discuss your specific needs and how RinglyPro can help streamline your business communications.

NEED TO RESCHEDULE?
Reply to this email or call us at (888) 610-3810 with your confirmation code.

We look forward to speaking with you!

Best regards,
The RinglyPro Team
Email: support@ringlypro.com
Phone: (888) 610-3810
Website: https://ringlypro.com
            """.strip()
            
            msg = MIMEMultipart()
            msg['From'] = from_email
            msg['To'] = appointment['customer_email']
            msg['Subject'] = subject
            msg.attach(MIMEText(body, 'plain'))
            
            server = smtplib.SMTP(smtp_server, smtp_port)
            server.starttls()
            server.login(email_user, email_password)
            server.send_message(msg)
            server.quit()
            
            logger.info(f"Email confirmation sent to {appointment['customer_email']}")
            return True
            
        except Exception as e:
            logger.error(f"Email sending failed: {e}")
            return False
    
    @staticmethod
    def send_sms_confirmation(appointment: dict) -> bool:
        """Send SMS confirmation"""
        try:
            if not all([twilio_account_sid, twilio_auth_token, twilio_phone]):
                logger.warning("Twilio credentials not configured")
                return False
            
            logger.info(f"Attempting to send SMS to: {appointment['customer_phone']}")
            
            client = Client(twilio_account_sid, twilio_auth_token)
            
            date_obj = datetime.strptime(appointment['date'], '%Y-%m-%d')
            formatted_date = date_obj.strftime('%m/%d/%Y')
            
            time_obj = datetime.strptime(appointment['time'], '%H:%M')
            formatted_time = time_obj.strftime('%I:%M %p')
            
            message_body = f"""
RinglyPro Appointment Confirmed

{formatted_date} at {formatted_time} EST
Join: {appointment['zoom_url']}
Code: {appointment['confirmation_code']}

Meeting ID: {appointment['zoom_id']}
Password: {appointment['zoom_password']}

Need help? Reply to this message or call (888) 610-3810.
            """.strip()
            
            message = client.messages.create(
                body=message_body,
                from_=twilio_phone,
                to=appointment['customer_phone']
            )
            
            logger.info(f"SMS confirmation sent. SID: {message.sid}")
            return True
            
        except Exception as e:
            logger.error(f"SMS sending failed: {e}")
            return False

# ==================== TELEPHONY CALL HANDLER ====================

class PhoneCallHandler:
    """Handle incoming phone calls with IVR and Rachel's voice"""
    
    def __init__(self):
        self.elevenlabs_api_key = elevenlabs_api_key
        self.rachel_voice_id = "21m00Tcm4TlvDq8ikWAM"
        self.webhook_base_url = os.getenv("WEBHOOK_BASE_URL", "https://voice-bot-r91r.onrender.com")
    
    def generate_rachel_audio(self, text: str) -> Optional[str]:
        """Generate audio URL using Rachel's voice via ElevenLabs"""
        if not self.elevenlabs_api_key:
            return None
            
        try:
            url = f"https://api.elevenlabs.io/v1/text-to-speech/{self.rachel_voice_id}"
            
            headers = {
                "Accept": "audio/mpeg",
                "Content-Type": "application/json",
                "xi-api-key": self.elevenlabs_api_key
            }
            
            speech_text = text.replace("RinglyPro", "Ringly Pro")
            speech_text = speech_text.replace("AI", "A.I.")
            speech_text = speech_text.replace("$", " dollars")
            
            tts_data = {
                "text": speech_text,
                "model_id": "eleven_monolingual_v1",
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75
                }
            }
            
            response = requests.post(url, json=tts_data, headers=headers, timeout=10)
            
            if response.status_code == 200:
                audio_filename = f"rachel_{uuid.uuid4()}.mp3"
                audio_path = f"/tmp/{audio_filename}"
                
                with open(audio_path, 'wb') as f:
                    f.write(response.content)
                
                audio_url = f"{self.webhook_base_url}/audio/{audio_filename}"
                logger.info(f"Rachel audio generated: {audio_url}")
                return audio_url
            else:
                logger.warning(f"ElevenLabs TTS failed: {response.status_code}")
                return None
                
        except Exception as e:
            logger.error(f"Error generating Rachel audio: {e}")
            return None

    def create_greeting_response(self) -> VoiceResponse:
        """Create the initial greeting when someone calls"""
        response = VoiceResponse()
        
        greeting_text = f"""
        Thank you for calling {CLIENT_NAME}, your A.I. powered business assistant. 
        I'm Rachel, your virtual receptionist. 
        To better serve you, please tell me what you'd like to do. 
        Say book a demo to schedule a consultation, 
        pricing to hear about our plans, 
        subscribe to get started with our service, 
        or support for customer service.
        """
        
        gather = Gather(
            input='speech',
            timeout=5,
            action='/phone/process-speech',
            method='POST',
            speechTimeout='auto',
            language='en-US'
        )
        
        audio_url = self.generate_rachel_audio(greeting_text)
        
        if audio_url:
            gather.play(audio_url)
            logger.info("Using Rachel's premium voice from ElevenLabs")
        else:
            gather.say(greeting_text, voice='Polly.Joanna', language='en-US')
            logger.info("Falling back to Twilio's Polly voice")
        
        response.append(gather)
        response.redirect('/phone/webhook')
        
        return response
    
    def process_speech_input(self, speech_result: str) -> VoiceResponse:
        """Process the caller's speech and route accordingly"""
        response = VoiceResponse()
        speech_lower = speech_result.lower().strip()
        
        logger.info(f"Phone speech input: {speech_result}")
        
        if any(word in speech_lower for word in ['demo', 'consultation', 'appointment', 'meeting', 'schedule']):
            return self.handle_demo_booking()
        elif any(word in speech_lower for word in ['price', 'pricing', 'cost', 'plan', 'package']):
            return self.handle_pricing_inquiry()
        elif any(word in speech_lower for word in ['subscribe', 'subscription', 'sign up', 'signup', 'get started', 'start service', 'want to subscribe', 'i want to subscribe']):
            return self.handle_subscription()
        elif any(word in speech_lower for word in ['support', 'help', 'customer service', 'agent', 'representative']):
            return self.handle_support_transfer()
        else:
            faq_response, is_faq = get_faq_response(speech_result)
            
            if is_faq and not is_no_answer_response(faq_response):
                if len(faq_response) > 300:
                    faq_response = faq_response[:297] + "..."
                
                audio_url = self.generate_rachel_audio(faq_response)
                
                if audio_url:
                    response.play(audio_url)
                else:
                    response.say(faq_response, voice='Polly.Joanna')
                
                response.pause(length=1)
                
                followup = Gather(
                    input='speech',
                    timeout=5,
                    action='/phone/process-speech',
                    method='POST',
                    speechTimeout='auto'
                )
                
                followup_text = "Is there anything else I can help you with today?"
                followup_audio = self.generate_rachel_audio(followup_text)
                
                if followup_audio:
                    followup.play(followup_audio)
                else:
                    followup.say(followup_text, voice='Polly.Joanna')
                
                response.append(followup)
            else:
                transfer_text = "I'd be happy to help with that. Let me connect you with someone who can provide more specific information."
                
                audio_url = self.generate_rachel_audio(transfer_text)
                
                if audio_url:
                    response.play(audio_url)
                else:
                    response.say(transfer_text, voice='Polly.Joanna')
                
                dial = Dial(action='/phone/call-complete', timeout=30)
                dial.number('+16566001400')
                response.append(dial)
            
            return response
    
    def handle_demo_booking(self) -> VoiceResponse:
        """Handle demo booking request"""
        response = VoiceResponse()
        
        booking_text = """
        Excellent! I'd be happy to schedule a free consultation for you. 
        Our team will show you how Ringly Pro can transform your business communications. 
        I'll need to collect a few details. 
        First, please say your full name.
        """
        
        gather = Gather(
            input='speech',
            timeout=5,
            action='/phone/collect-name',
            method='POST',
            speechTimeout='auto'
        )
        
        audio_url = self.generate_rachel_audio(booking_text)
        
        if audio_url:
            gather.play(audio_url)
            logger.info("Using Rachel's voice for booking")
        else:
            gather.say(booking_text, voice='Polly.Joanna')
            logger.info("Falling back to Polly voice")
        
        response.append(gather)
        
        return response
    
    def handle_pricing_inquiry(self) -> VoiceResponse:
        """Provide pricing information"""
        response = VoiceResponse()
        
        pricing_text = """
        I'd be happy to share our pricing plans with you. 
        
        We offer three tiers:
        
        The Starter Plan at 97 dollars per month includes 1000 minutes, 
        text messaging, and appointment scheduling.
        
        The Pro Plan at 297 dollars per month includes 3000 minutes, 
        C.R.M. integrations, and mobile app access.
        
        The Premium Plan at 497 dollars per month includes 7500 minutes, 
        dedicated account management, and marketing automation.
        
        Would you like to schedule a consultation to discuss which plan is right for you? 
        Say yes to book a demo, or repeat to hear the prices again.
        """
        
        gather = Gather(
            input='speech',
            timeout=5,
            action='/phone/pricing-followup',
            method='POST',
            speechTimeout='auto'
        )
        
        audio_url = self.generate_rachel_audio(pricing_text)
        
        if audio_url:
            gather.play(audio_url)
            logger.info("Using Rachel's voice for pricing")
        else:
            gather.say(pricing_text, voice='Polly.Joanna')
            logger.info("Falling back to Polly voice")
        
        response.append(gather)
        
        return response
    
    def handle_subscription(self) -> VoiceResponse:
        """Handle subscription request with SMS and transfer"""
        response = VoiceResponse()
        
        try:
            caller_phone = request.form.get('From', '')
            logger.info(f"Subscription request from: {caller_phone}")
            
            subscribe_text = """
            Wonderful! I'm excited to help you get started with Ringly Pro. 
            I'm sending you our subscription link via text message right now.
            I'll also connect you with our onboarding specialist 
            who will walk you through the setup process. 
            
            Please hold while I transfer you.
            """
            
            audio_url = self.generate_rachel_audio(subscribe_text)
            
            if audio_url:
                response.play(audio_url)
            else:
                response.say(subscribe_text, voice='Polly.Joanna')
            
            if caller_phone:
                self.send_subscription_sms(caller_phone)
            
            response.pause(length=1)
            
            dial = Dial(
                action='/phone/call-complete',
                timeout=30,
                record='record-from-answer-dual'
            )
            dial.number('+16566001400')
            response.append(dial)
            
            return response
            
        except Exception as e:
            logger.error(f"Error in handle_subscription: {e}")
            response.say("I'll connect you with our team to help with your subscription.", voice='Polly.Joanna')
            dial = Dial()
            dial.number('+16566001400')
            response.append(dial)
            return response
    
    def handle_support_transfer(self) -> VoiceResponse:
        """Transfer to customer support"""
        response = VoiceResponse()
        
        transfer_text = "I'll connect you with our customer support team right away. Please hold."
        
        audio_url = self.generate_rachel_audio(transfer_text)
        
        if audio_url:
            response.play(audio_url)
        else:
            response.say(transfer_text, voice='Polly.Joanna')
        
        dial = Dial(
            action='/phone/call-complete',
            timeout=30,
            record='record-from-answer-dual'
        )
        dial.number('+16566001400')
        response.append(dial)
        
        return response
    
    def collect_booking_info(self, step: str, value: str = None) -> VoiceResponse:
        """Multi-step booking information collection"""
        response = VoiceResponse()
        
        if step == 'name':
            gather = Gather(
                input='speech dtmf',
                timeout=10,
                action='/phone/collect-phone',
                method='POST',
                speechTimeout='auto',
                numDigits=10,
                finishOnKey='#'
            )
            
            text = f"Thank you {value}. Now, please say or enter your phone number using the keypad."
            audio_url = self.generate_rachel_audio(text)
            
            if audio_url:
                gather.play(audio_url)
            else:
                gather.say(text, voice='Polly.Joanna')
            
            response.append(gather)
            
        elif step == 'phone':
            try:
                import flask
                call_sid = flask.request.form.get('CallSid', 'unknown')
                customer_name = flask.session.get(f'call_{call_sid}_name', 'Customer')
                
                success, confirmation_code = self.create_appointment_from_phone(
                    customer_name, 
                    value,
                    call_sid
                )
                
                if success and confirmation_code:
                    text1 = f"Perfect! I've scheduled your consultation. Your confirmation code is {confirmation_code}. You'll receive text and email confirmations with all the details including your Zoom meeting link."
                else:
                    text1 = f"Perfect! I have your phone number as {value}. I'll send you a text message with a link to schedule your consultation online at your convenience."
                    self.send_booking_sms(value)
                    
            except Exception as e:
                logger.error(f"Appointment creation error: {e}")
                text1 = f"Perfect! I have your phone number as {value}. I'll send you a text message with a link to schedule your consultation online at your convenience."
                self.send_booking_sms(value)
            
            audio_url = self.generate_rachel_audio(text1)
            
            if audio_url:
                response.play(audio_url)
            else:
                response.say(text1, voice='Polly.Joanna')
            
            response.pause(length=1)
            
            text2 = "Is there anything else I can help you with today?"
            
            audio_url2 = self.generate_rachel_audio(text2)
            
            if audio_url2:
                response.play(audio_url2)
            else:
                response.say(text2, voice='Polly.Joanna')
            
            gather = Gather(
                input='speech',
                timeout=5,
                action='/phone/process-speech',
                method='POST'
            )
            response.append(gather)
            
        return response
    
    def send_booking_sms(self, phone_number: str):
        """Send SMS with booking link"""
        try:
            if not all([twilio_account_sid, twilio_auth_token, twilio_phone]):
                logger.warning("Twilio not configured for SMS")
                return
            
            client = Client(twilio_account_sid, twilio_auth_token)
            
            message_body = f"""
Thank you for calling RinglyPro!

Schedule your FREE consultation:
{self.webhook_base_url}/chat-enhanced

Or reply to this message with your preferred date/time.

Questions? Call us back at 888-610-3810

- The RinglyPro Team
            """.strip()
            
            message = client.messages.create(
                body=message_body,
                from_=twilio_phone,
                to=phone_number
            )
            
            logger.info(f"Booking SMS sent to {phone_number}: {message.sid}")
            
        except Exception as e:
            logger.error(f"Failed to send booking SMS: {e}")
    
    def send_subscription_sms(self, phone_number: str):
        """Send SMS with subscription link"""
        try:
            if not all([twilio_account_sid, twilio_auth_token, twilio_phone]):
                logger.warning("Twilio not configured for subscription SMS")
                return
            
            client = Client(twilio_account_sid, twilio_auth_token)
            
            message_body = f"""
Thanks for wanting to subscribe to RinglyPro!

Complete your subscription here:
https://ringlypro.com/subscribe

You're also being connected to our specialist now.

Questions? Call us back at 888-610-3810

- The RinglyPro Team
            """.strip()
            
            message = client.messages.create(
                body=message_body,
                from_=twilio_phone,
                to=phone_number
            )
            
            logger.info(f"Subscription SMS sent to {phone_number}: {message.sid}")
            
        except Exception as e:
            logger.error(f"Failed to send subscription SMS: {e}")
    
    def create_appointment_from_phone(self, name: str, phone: str, call_sid: str) -> Tuple[bool, Optional[str]]:
        """Create appointment via PostgreSQL API after phone collection"""
        try:
            phone_digits = re.sub(r'\D', '', phone)[-10:]
            email = f"phone.{phone_digits}@booking.ringlypro.com"
            
            from datetime import datetime, timedelta
            tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
            
            logger.info(f"Creating phone appointment for {name} ({phone}) via PostgreSQL API")
            
            appointment_data = {
                'name': name,
                'email': email,
                'phone': phone,
                'date': tomorrow,
                'time': '10:00',
                'purpose': f'Phone booking - Call {call_sid[:8]} - NEEDS EMAIL VERIFICATION'
            }
            
            appointment_manager = AppointmentManager()
            success, message, appointment = appointment_manager.book_appointment(appointment_data)
            
            if success:
                logger.info(f"Phone appointment created via PostgreSQL: {appointment.get('confirmation_code')}")
                return True, appointment.get('confirmation_code', 'PENDING')
            else:
                logger.warning(f"Failed to create appointment via PostgreSQL: {message}")
                return False, None
                
        except Exception as e:
            logger.error(f"Failed to create phone appointment via PostgreSQL: {e}")
            return False, None

def send_call_data_to_crm(call_data):
    """Send call data to PostgreSQL via CRM webhook"""
    try:
        logger.info(f"Sending call data to PostgreSQL: {call_data.get('CallSid', 'Unknown')}")
        
        crm_payload = {
            'CallSid': call_data.get('CallSid'),
            'From': call_data.get('From'),
            'To': call_data.get('To'),
            'CallStatus': call_data.get('CallStatus'),
            'Direction': call_data.get('Direction', 'inbound'),
            'AccountSid': call_data.get('AccountSid'),
            'SpeechResult': call_data.get('SpeechResult'),
            'Timestamp': datetime.now().isoformat(),
            'Source': 'Rachel-AI-Assistant',
            'Notes': 'Call handled by Rachel AI Assistant'
        }
        
        crm_payload = {k: v for k, v in crm_payload.items() if v is not None}
        
        response = requests.post(
            CRM_WEBHOOK_URL,
            headers={'Content-Type': 'application/json'},
            json=crm_payload,
            timeout=5
        )
        
        if response.status_code in [200, 201, 204]:
            logger.info(f"PostgreSQL webhook successful: {response.status_code}")
        else:
            logger.warning(f"PostgreSQL webhook failed: {response.status_code}")
            
    except Exception as e:
        logger.warning(f"PostgreSQL webhook error: {str(e)} - continuing without PostgreSQL logging")

# ==================== SMS/PHONE HELPER FUNCTIONS ====================

def validate_phone_number(phone_str: str) -> Optional[str]:
    """Validate and format phone number"""
    try:
        number = phonenumbers.parse(phone_str, "US")
        
        if phonenumbers.is_valid_number(number):
            return phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164)
        else:
            return None
    except NumberParseException:
        return None

def send_sms_notification(customer_phone: str, customer_question: str, source: str = "chat") -> Tuple[bool, str]:
    """Send SMS notification to customer service"""
    try:
        if not all([twilio_account_sid, twilio_auth_token, twilio_phone]):
            logger.warning("Twilio credentials not configured - SMS notification skipped")
            return False, "SMS credentials not configured"
            
        client = Client(twilio_account_sid, twilio_auth_token)
        
        message_body = f"""
New RinglyPro Customer Inquiry

Phone: {customer_phone}
Question: {customer_question}
Source: {source}
Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

Please follow up with this customer.
        """.strip()
        
        message = client.messages.create(
            body=message_body,
            from_=twilio_phone,
            to='+16566001400'
        )
        
        logger.info(f"SMS sent successfully. SID: {message.sid}")
        return True, message.sid
        
    except Exception as e:
        logger.error(f"SMS sending failed: {str(e)}")
        return False, str(e)

def save_customer_inquiry(phone: str, question: str, sms_sent: bool, sms_sid: str = "", source: str = "chat") -> bool:
    """Save customer inquiry to PostgreSQL via CRM API"""
    try:
        return save_customer_inquiry_to_crm(phone, question, sms_sent, sms_sid, source)
    except Exception as e:
        logger.error(f"PostgreSQL save failed: {e}")
        return False

def is_no_answer_response(response: str) -> bool:
    """Check if the FAQ response indicates no answer was found"""
    no_answer_indicators = [
        "I don't have information",
        "couldn't find a direct answer", 
        "please contact our customer service",
        "I don't have a specific answer",
        "contact our support team"
    ]
    return any(indicator in response.lower() for indicator in no_answer_indicators)
    # ==================== EXTENSIVE FAQ BRAIN ====================

FAQ_BRAIN = {
    # ==================== BASIC PLATFORM INFORMATION ====================
    "what is ringlypro?": "RinglyPro.com is a 24/7 AI-powered call answering and client booking service designed for small businesses and professionals. It ensures you never miss a call by providing automated phone answering, appointment scheduling, and customer communication through AI technology.",

    "what does ringlypro do?": "RinglyPro provides 24/7 answering service, bilingual virtual receptionists (English/Spanish), AI-powered chat and text messaging, missed-call text-back, appointment scheduling, and integrations with existing business apps like CRMs and calendars.",

    "who owns ringlypro?": "RinglyPro.com is owned and operated by DIGIT2AI LLC, a company focused on building technology solutions that create better business opportunities.",

    "what is the history of ringlypro?": "RinglyPro was founded as part of DIGIT2AI's mission to help small businesses compete with larger companies by providing enterprise-level communication tools through artificial intelligence and automation.",

    # ==================== CORE FEATURES ====================
    "what are ringlypro main features?": "Key features include: 24/7 AI call answering, bilingual virtual receptionists, AI-powered chat & text, missed-call text-back, appointment scheduling, CRM integrations, call recording, automated booking tools, and mobile app access.",

    "does ringlypro support multiple languages?": "Yes, RinglyPro offers bilingual virtual receptionists that provide professional support in both English and Spanish to help businesses serve a wider audience.",

    "can ringlypro integrate with my existing tools?": "Yes, RinglyPro integrates seamlessly with existing CRMs, schedulers, calendars, and other business apps. Integration is available through online links or using Zapier for broader connectivity.",

    "does ringlypro offer appointment scheduling?": "Yes, clients can schedule appointments through phone, text, or online booking. All appointments sync with your existing calendar system for easy management.",

    "what is ai-powered call answering?": "RinglyPro's AI answering service uses advanced artificial intelligence to answer calls professionally, take messages, schedule appointments, and route calls according to your business needs, all while maintaining a natural conversation flow.",

    "what is missed-call text-back?": "Missed-call text-back is a feature that instantly re-engages callers you couldn't answer by automatically sending them a text message, keeping conversations and opportunities alive.",

    "does ringlypro record calls?": "Yes, call recording is available as a feature across all plans, allowing you to review conversations and maintain records of customer interactions.",

    "can i get a toll-free number?": "Yes, RinglyPro offers toll-free numbers and vanity numbers as part of their service options.",

    "does ringlypro have a mobile app?": "Yes, a mobile app is included with the Office Manager and Business Growth plans, allowing you to manage your service on the go.",

    "what is call forwarding?": "RinglyPro provides intelligent call forwarding that routes calls to the right person or department based on your customized rules and business hours.",

    "does ringlypro support call queuing?": "Yes, live call queuing is available with the Office Manager and Business Growth plans, ensuring callers are handled professionally during busy periods.",

    # ==================== PRICING & PLANS ====================
    "how much does ringlypro cost?": "RinglyPro offers three pricing tiers: Starter ($97/month), Pro Plan ($297/month), and Premium Plan ($497/month). Each plan includes different amounts of minutes, text messages, and online replies.",

    "what is included in the starter plan?": "The Scheduling Assistant plan ($97/month) includes 1,000 minutes, 1,000 text messages, 1,000 online replies, self-guided setup, email support, premium voice options, call forwarding/porting, toll-free numbers, call recording, and automated booking tools.",

    "what is included in the office manager plan?": "The Office Manager plan ($297/month) includes 3,000 minutes, 3,000 texts, 3,000 online replies, all Starter features plus assisted onboarding, phone/email/text support, custom voice choices, live call queuing, Zapier integrations, CRM setup, invoice automation, payment gateway setup, and mobile app.",

    "what is included in the business growth plan?": "The Marketing Director plan ($497/month) includes 7,500 minutes, 7,500 texts, 7,500 online replies, everything in Office Manager plus professional onboarding, dedicated account manager, custom integrations, landing page design, lead capture automation, Google Ads campaign, email marketing, reputation management, conversion reporting, and monthly analytics.",

    "what is the cheapest plan?": "The most affordable plan is the Scheduling Assistant at $97/month, which includes essential features like 1,000 minutes, text messaging, appointment scheduling, and call recording.",

    "what is the most popular plan?": "The Office Manager plan ($297/month) is popular with growing businesses as it includes enhanced support, mobile app access, CRM integrations, and expanded capacity.",

    "are there any setup fees?": "Setup fees vary by plan. The Scheduling Assistant includes self-guided setup, while higher plans include assisted or professional onboarding.",

    "can i change plans later?": "Yes, you can upgrade or downgrade your plan as your business needs change. Contact customer service to discuss plan changes.",

    "what happens if i exceed my plan limits?": "RinglyPro offers overage protection and will work with you to find the right plan if you consistently exceed your current limits.",

    "is there a free trial?": "Contact RinglyPro directly for information about trial options and demonstrations of the service.",

    # ==================== TECHNICAL CAPABILITIES ====================
    "how does the ai work?": "RinglyPro uses advanced natural language processing and machine learning to understand caller intent, provide appropriate responses, and take actions like scheduling appointments or transferring calls.",

    "is the ai voice natural sounding?": "Yes, RinglyPro offers premium voice options that sound natural and professional, with the ability to customize voice choices on higher-tier plans.",

    "can the ai handle complex conversations?": "The AI is designed to handle a wide range of business conversations, from simple inquiries to appointment scheduling and call routing. For complex issues, it can seamlessly transfer to human agents.",

    "what about data security?": "RinglyPro follows industry-standard security practices to protect your business and customer data, including encrypted communications and secure data storage.",

    "how reliable is the service?": "RinglyPro provides 24/7 availability with enterprise-grade reliability and redundancy to ensure your business never misses important calls.",

    "can ringlypro work with my existing phone system?": "Yes, RinglyPro can integrate with most existing phone systems through call forwarding, number porting, or direct integration.",

    "what is call porting?": "Call porting allows you to transfer your existing business phone number to RinglyPro, so customers can continue calling the same number while benefiting from AI answering services.",

    # ==================== INTEGRATION QUESTIONS ====================
    "what crms does ringlypro work with?": "RinglyPro mentions working with CRMs and offers CRM setup for small businesses. They integrate through online links and Zapier, which supports hundreds of popular CRM systems including Salesforce, HubSpot, and others.",

    "can ringlypro integrate with zapier?": "Yes, Zapier integration is available with the Office Manager and Business Growth plans, allowing connection to thousands of business applications.",

    "does ringlypro work with stripe?": "Yes, Stripe/Payment Gateway Setup is included in the Office Manager and Business Growth plans.",

    "can ringlypro integrate with google calendar?": "Yes, RinglyPro integrates with popular calendar systems through our HubSpot CRM integration, which can sync with Google Calendar and other calendar platforms for seamless appointment scheduling.",

    "does ringlypro work with microsoft office?": "Integration with Microsoft Office tools is available through Zapier connections and direct integrations on higher-tier plans.",

    "can ringlypro connect to my website?": "Yes, RinglyPro offers website integration options including chat widgets, booking forms, and lead capture tools.",

    "what about social media integration?": "Social media management and integration tools are available with the Marketing Director plan.",

    # ==================== BUSINESS BENEFITS ====================
    "how will ringlypro help my business?": "RinglyPro helps businesses never miss opportunities, reduce staffing costs, improve customer service, automate routine tasks, and provide 24/7 availability without hiring additional staff.",

    "what industries does ringlypro serve?": "RinglyPro serves a wide range of industries including healthcare, legal services, real estate, home services, professional services, retail, and any business that relies on phone communications.",

    "is ringlypro good for small businesses?": "Yes, RinglyPro is specifically designed for small businesses and professionals who need enterprise-level communication tools without the complexity and cost of traditional systems.",

    "can ringlypro replace my receptionist?": "RinglyPro can handle many receptionist duties including answering calls, scheduling appointments, taking messages, and routing calls, while providing 24/7 availability.",

    "will ringlypro save me money?": "Many businesses save money by reducing staffing needs while improving service quality and availability. The cost is often less than hiring part-time reception staff.",

    "how quickly can i get started?": "Implementation time varies by plan. The Scheduling Assistant includes self-guided setup for quick deployment, while higher plans include assisted onboarding for more complex integrations.",

    # ==================== CUSTOMER SUPPORT ====================
    "how can i contact ringlypro support?": "You can contact RinglyPro customer service at (656) 213-3300 or via email. The level of support (email, phone, text) depends on your plan level.",

    "what are ringlypro business hours?": "RinglyPro provides 24/7 service availability. Their experts are available around the clock to support and grow your business.",

    "do you offer training?": "Yes, training and onboarding support is included with all plans, with more comprehensive training available on higher-tier plans.",

    "what if i need help setting up?": "Setup assistance varies by plan - from self-guided setup on the basic plan to professional onboarding and dedicated account management on premium plans.",

    "can i get a demo?": "Contact RinglyPro directly to schedule a demonstration of the platform and see how it can work for your specific business needs.",

    # ==================== APPOINTMENT BOOKING SPECIFIC ====================
    "how do i schedule an appointment?": "I can help you schedule an appointment right now! Just say 'book appointment' or click the Book Appointment button. I'll need your name, email, phone number, and preferred date/time.",
    
    "book an appointment": "Perfect! I'd be happy to help you schedule an appointment. Let me guide you through the booking process right now.",
    
    "schedule appointment": "Excellent! I can help you schedule an appointment immediately. Let me set up the booking form for you.",
    
    "i want to book": "Great! I'm ready to help you book an appointment. Let me get the scheduling process started for you right away.",
    
    "what are your available times?": "We're available Monday-Friday 9 AM to 5 PM, and Saturday 10 AM to 2 PM (Eastern Time). I can show you specific available slots once you let me know your preferred date.",
    
    "how far in advance can i book?": "You can schedule appointments up to 30 days in advance. For same-day appointments, we require at least 1 hour notice.",
    
    "can i reschedule my appointment?": "Yes! You can reschedule by providing your confirmation code. Would you like to reschedule an existing appointment?",
    
    "what happens in a consultation?": "Our consultations are 30-minute sessions via Zoom where we discuss your business needs and how RinglyPro can help. You'll receive all meeting details after booking.",
    
    "do you charge for consultations?": "Initial consultations are complimentary! This gives us a chance to understand your needs and show you how RinglyPro can benefit your business.",

    "what should i prepare for my appointment?": "Come prepared with information about your business, current communication challenges, call volume, and any specific features you're interested in. We'll tailor our discussion to your needs.",

    "can i bring team members to the consultation?": "Absolutely! Feel free to invite relevant team members to join the Zoom consultation. This can help ensure everyone understands how RinglyPro will benefit your business.",

    "what if i need to cancel my appointment?": "You can cancel or reschedule by contacting us with your confirmation code. We recommend giving at least 24 hours notice when possible.",

    "will i receive reminders about my appointment?": "Yes, you'll receive both email and SMS confirmations immediately after booking, and we typically send reminder notifications before your scheduled appointment.",

    # ==================== ADDITIONAL 50 APPOINTMENT & SERVICE FAQs ====================
    
    # APPOINTMENT BOOKING QUESTIONS
    "how do i book a consultation?": "To book a free consultation, say 'book appointment' or click the booking button. I'll guide you through selecting a convenient time for your 30-minute Zoom consultation.",
    
    "what times are available for appointments?": "We're available Monday-Friday 9 AM to 5 PM, and Saturday 10 AM to 2 PM (Eastern Time). I can show you specific available slots once you select your preferred date.",
    
    "can i schedule a demo today?": "Yes! For same-day appointments, we require at least 1 hour notice. Say 'book appointment' and I'll show you today's available time slots.",
    
    "how long is the consultation?": "Our consultations are 30-minute Zoom sessions where we discuss your business needs and demonstrate how RinglyPro can help streamline your communications.",
    
    "is the consultation free?": "Yes! Initial consultations are completely free with no obligation. It's our opportunity to understand your needs and show you how RinglyPro works.",
    
    "what do i need for the consultation?": "Just bring information about your business, current communication challenges, and any specific questions. We'll handle everything else during the Zoom meeting.",
    
    "will i get a reminder?": "Yes! You'll receive both email and SMS confirmations immediately after booking, plus reminder notifications before your scheduled appointment.",
    
    "can multiple people join the consultation?": "Absolutely! Feel free to invite team members to the Zoom consultation. The meeting link supports multiple participants.",

    # SERVICE CAPABILITIES
    "can you answer my business calls?": "Yes! RinglyPro answers all your business calls 24/7 with our AI-powered virtual receptionist, ensuring you never miss an important call or opportunity.",
    
    "do you handle after hours calls?": "Absolutely! We provide 24/7 call answering service, including nights, weekends, and holidays, so your business is always accessible to customers.",
    
    "can you take messages?": "Yes, we take detailed messages from callers and can deliver them via text, email, or through your CRM system based on your preferences.",
    
    "do you screen calls?": "Yes! Our AI can screen calls based on your criteria, routing important calls to you immediately while handling routine inquiries automatically.",
    
    "can you transfer calls to me?": "Absolutely! We can transfer urgent calls to you or your team members based on customizable rules and availability schedules you set.",
    
    "do you handle spanish calls?": "Si! We offer bilingual support in English and Spanish, helping you serve a wider customer base with professional service in both languages.",
    
    "can you book appointments for my business?": "Yes! We handle appointment scheduling through phone, text, or online booking, and sync everything with your existing calendar system.",
    
    "do you send appointment reminders?": "Yes, we send automated appointment reminders via text and email to reduce no-shows and keep your schedule running smoothly.",
    
    "can you process payments?": "With our Office Manager and Business Growth plans, we can integrate payment processing through Stripe and other payment gateways.",
    
    "do you handle customer service calls?": "Yes! We handle customer service inquiries, answer FAQs, process requests, and escalate complex issues to your team when needed.",

    # TECHNICAL & INTEGRATION
    "how does the ai receptionist work?": "Our AI receptionist uses advanced natural language processing to understand callers, respond conversationally, and take appropriate actions like booking appointments or routing calls.",
    
    "will it sound like a robot?": "No! We use premium, natural-sounding voices. Callers often don't realize they're speaking with AI because the conversation flows so naturally.",
    
    "can it understand different accents?": "Yes, our AI is trained on diverse speech patterns and accents, ensuring clear communication with all your customers.",
    
    "what if the ai doesn't understand?": "If the AI doesn't understand something, it smoothly transfers the call to a human or takes a message for follow-up, ensuring no customer is left frustrated.",
    
    "can i customize the ai responses?": "Yes! We customize the AI's responses, greeting messages, and conversation flows to match your business's tone and specific needs.",
    
    "does it integrate with my crm?": "Yes, we integrate with popular CRMs like HubSpot, Salesforce, and hundreds more through direct integration or Zapier connections.",
    
    "can it access my calendar?": "Yes! The AI can access your calendar to check availability, book appointments, and prevent double-booking, keeping your schedule organized.",
    
    "will it work with my phone number?": "Yes! You can keep your existing phone number through our porting service, or forward calls to our system - whatever works best for you.",
    
    "can i monitor the calls?": "Yes, all plans include call recording and detailed analytics, so you can review conversations and monitor service quality.",
    
    "is my data secure?": "Absolutely! We use enterprise-grade security with encrypted communications, secure data storage, and comply with privacy regulations.",

    # BUSINESS BENEFITS & ROI
    "how much time will this save me?": "Most businesses save 10-20 hours per week by automating call handling and appointment scheduling, letting you focus on core business activities.",
    
    "will this reduce missed calls?": "Yes! With 24/7 availability, you'll capture every call and opportunity. Most businesses see a 90% reduction in missed calls.",
    
    "can this replace my receptionist?": "RinglyPro handles receptionist duties like answering calls, scheduling, and message-taking 24/7, often more cost-effectively than hiring staff.",
    
    "how much money can i save?": "Most businesses save 50-70% compared to hiring reception staff, while getting 24/7 coverage instead of just business hours.",
    
    "will my customers like it?": "Yes! Customers appreciate immediate answers, 24/7 availability, and efficient service. Our AI maintains a professional, friendly tone they'll love.",
    
    "can it help me get more clients?": "Absolutely! By never missing calls, following up instantly, and providing 24/7 availability, most businesses see a 20-30% increase in lead capture.",
    
    "how fast can i see results?": "Most businesses see immediate improvements in call handling and customer satisfaction, with measurable ROI within the first month.",
    
    "what if i'm not tech savvy?": "No problem! We handle all the technical setup and provide training. Our interface is user-friendly and our support team is always available to help.",
    
    "can i try it before committing?": "Contact us for a personalized demo where we'll show you exactly how RinglyPro will work for your specific business needs.",
    
    "is there a contract?": "We offer flexible month-to-month plans with no long-term contracts required. You can upgrade, downgrade, or cancel anytime.",

    # SPECIFIC USE CASES
    "i run a law firm can this help?": "Perfect for law firms! We handle intake calls, schedule consultations, and ensure confidential message handling while maintaining professional standards.",
    
    "i'm a real estate agent will this work?": "Ideal for real estate! We capture leads 24/7, schedule showings, and ensure you never miss a potential buyer or seller while you're in the field.",
    
    "i have a medical practice is this suitable?": "Yes! We handle appointment scheduling, prescription refill requests, and emergency call routing while maintaining HIPAA compliance standards.",
    
    "i run a home service business can you help?": "Perfect! We schedule service calls, provide quotes, dispatch emergencies, and handle customer inquiries while you're on job sites.",
    
    "i'm a solo entrepreneur is this too much?": "Not at all! Our Starter plan is perfect for solopreneurs who need professional call handling without the overhead of hiring staff.",
    
    "we're a small team will this scale?": "Absolutely! Start with our basic plan and scale up as you grow. We handle businesses from solopreneurs to companies with hundreds of calls daily.",
    
    "i get international calls can you handle them?": "Yes! We can handle international calls and provide service in multiple time zones, perfect for businesses with global customers.",
    
    "i need emergency call handling is that possible?": "Yes! We can identify and route emergency calls according to your protocols, ensuring urgent matters get immediate attention.",
    
    "can you handle sales calls?": "Yes! We can qualify leads, answer product questions, process orders, and transfer hot prospects to your sales team immediately.",
    
    "what about technical support calls?": "We handle tier-1 support, answer FAQs, create tickets, and escalate complex technical issues to your team with detailed context."
}

# ==================== FAQ PROCESSING FUNCTIONS ====================

def get_faq_response(user_text: str) -> Tuple[str, bool]:
    """
    Check for FAQ matches with fuzzy matching and web scraping
    Returns: (response_text, is_faq_match)
    """
    user_text_lower = user_text.lower().strip()
    
    # Try exact match first
    if user_text_lower in FAQ_BRAIN:
        return FAQ_BRAIN[user_text_lower], True
    
    # Try fuzzy matching
    matched = get_close_matches(user_text_lower, FAQ_BRAIN.keys(), n=1, cutoff=0.6)
    if matched:
        return FAQ_BRAIN[matched[0]], True
    
    # Try web scraping RinglyPro.com
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (compatible; FAQ-Bot)'}
        response = requests.get("https://RinglyPro.com", headers=headers, timeout=5)
        if response.status_code == 200:
            soup = BeautifulSoup(response.content, 'html.parser')
            text = soup.get_text()
            if len(text) > 100:
                return "Based on information from our website: I found some relevant content that might help. For more specific assistance, please contact our support team.", True
    except Exception as e:
        logger.warning(f"Web scraping failed: {e}")
    
    # Fallback to customer service
    return "I don't have a specific answer to that question. Please contact our Customer Service team for specialized assistance.", True

def get_faq_response_with_sms(user_text: str) -> Tuple[str, bool, bool]:
    """
    Check for FAQ matches with SMS phone collection capability
    Returns: (response_text, is_faq_match, needs_phone_collection)
    """
    user_text_lower = user_text.lower().strip()
    
    # Try exact match first
    if user_text_lower in FAQ_BRAIN:
        return FAQ_BRAIN[user_text_lower], True, False
    
    # Try fuzzy matching
    matched = get_close_matches(user_text_lower, FAQ_BRAIN.keys(), n=1, cutoff=0.6)
    if matched:
        return FAQ_BRAIN[matched[0]], True, False
    
    # Try web scraping RinglyPro.com
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (compatible; FAQ-Bot)'}
        response = requests.get("https://RinglyPro.com", headers=headers, timeout=5)
        if response.status_code == 200:
            soup = BeautifulSoup(response.content, 'html.parser')
            text = soup.get_text()
            if len(text) > 100:
                return "I found some information on our website that might be related, but I'd like to connect you with our customer service team for personalized assistance with your specific question. Could you please provide your phone number so they can reach out to help you?", False, True
    except Exception as e:
        logger.warning(f"Web scraping failed: {e}")
    
    # Fallback to customer service with phone collection
    return "I don't have a specific answer to that question. I'd like to connect you with our customer service team. Could you please provide your phone number so they can reach out to help you?", False, True

def get_enhanced_faq_response(user_text: str) -> Tuple[str, bool, str]:
    """
    Enhanced FAQ with appointment booking capabilities
    Returns: (response_text, is_faq_match, action_needed)
    """
    user_text_lower = user_text.lower().strip()
    
    logger.info(f"Enhanced FAQ processing: '{user_text_lower}'")
    
    # Check for appointment booking intent - PRIORITY CHECK
    booking_keywords = [
        'schedule', 'book', 'appointment', 'meeting', 'consultation', 
        'available', 'calendar', 'time', 'when can', 'set up', 'book an'
    ]
    
    booking_detected = any(keyword in user_text_lower for keyword in booking_keywords)
    logger.info(f"Booking keywords detected: {booking_detected}")
    
    if booking_detected:
        logger.info("Returning booking action")
        return ("I'd be happy to help you schedule an appointment! Let me guide you through the booking process.", 
                True, "start_booking")
    
    # Check for rescheduling intent
    reschedule_keywords = ['reschedule', 'change', 'move', 'cancel', 'confirmation code']
    if any(keyword in user_text_lower for keyword in reschedule_keywords):
        return ("I can help you manage your existing appointment. Do you have your confirmation code?", 
                True, "manage_appointment")
    
    # Only check FAQ if no booking intent detected
    logger.info("Checking FAQ database")
    
    # Try exact match first
    if user_text_lower in FAQ_BRAIN:
        return FAQ_BRAIN[user_text_lower], True, "none"
    
    # Try fuzzy matching
    matched = get_close_matches(user_text_lower, FAQ_BRAIN.keys(), n=1, cutoff=0.6)
    if matched:
        response = FAQ_BRAIN[matched[0]]
        # Add booking CTA to pricing questions
        if 'pricing' in matched[0] or 'cost' in matched[0] or 'plan' in matched[0]:
            response += " Would you like to schedule a free consultation to discuss your needs?"
            return response, True, "suggest_booking"
        return response, True, "none"
    
    # Fallback with booking option
    logger.info("No FAQ match, offering booking")
    return ("I don't have a specific answer to that question, but I'd be happy to connect you with our team. Would you like to schedule a consultation or provide your phone number for a callback?", 
            False, "offer_booking")
    # ==================== EXTENSIVE HTML TEMPLATES ====================

VOICE_HTML_TEMPLATE = '''
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#2c3e50">
  <meta http-equiv="Permissions-Policy" content="microphone=*">
  <title>Talk to RinglyPro AI – Your Business Assistant</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    * { 
      box-sizing: border-box;
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      -khtml-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }

    html, body {
      margin: 0;
      padding: 0;
      font-family: 'Inter', sans-serif;
      background: linear-gradient(135deg, #2c3e50 0%, #0d1b2a 100%);
      color: #ffffff;
      width: 100%;
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      text-align: center;
      overflow: hidden;
    }

    @media (max-width: 768px) {
      html, body {
        background: linear-gradient(135deg, #1a237e 0%, #0d47a1 50%, #01579b 100%);
      }
    }

    @media (pointer: coarse) {
      html, body {
        background: linear-gradient(135deg, #1a237e 0%, #0d47a1 50%, #01579b 100%);
      }
    }

    .container {
      max-width: 450px;
      width: 100%;
      padding: 2rem;
      background: rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(15px);
      border-radius: 25px;
      box-shadow: 0 8px 32px rgba(31, 38, 135, 0.37);
      border: 1px solid rgba(255, 255, 255, 0.18);
      position: relative;
    }

    @media (max-width: 768px) {
      .container {
        background: rgba(255, 255, 255, 0.12);
        box-shadow: 0 8px 32px rgba(13, 71, 161, 0.4);
      }
    }

    h1 {
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      background: linear-gradient(45deg, #4CAF50, #2196F3, #FF6B6B);
      background-size: 200% auto;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: gradientShift 3s ease-in-out infinite;
    }

    @keyframes gradientShift {
      0%, 100% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
    }

    .subtitle {
      font-size: 1.1rem;
      margin-bottom: 2.5rem;
      opacity: 0.9;
      font-weight: 500;
    }

    .interface-switcher {
      position: absolute;
      top: 20px;
      right: 20px;
      background: rgba(255, 255, 255, 0.2);
      border: none;
      border-radius: 15px;
      color: white;
      padding: 0.5rem 1rem;
      cursor: pointer;
      font-size: 0.8rem;
      transition: all 0.3s ease;
    }

    .interface-switcher:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    .booking-button {
      position: absolute;
      top: 20px;
      left: 20px;
      background: linear-gradient(135deg, #4CAF50, #45a049);
      border: none;
      border-radius: 15px;
      color: white;
      padding: 0.75rem 1.5rem;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 600;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(76, 175, 80, 0.3);
      animation: bookingPulse 3s ease-in-out infinite;
    }

    .booking-button:hover {
      background: linear-gradient(135deg, #45a049, #388e3c);
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(76, 175, 80, 0.4);
      animation: none;
    }

    @keyframes bookingPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }

    .booking-form-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(44, 62, 80, 0.95);
      backdrop-filter: blur(10px);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 1000;
      padding: 20px;
    }
    
    .booking-form-container {
      background: rgba(255, 255, 255, 0.98);
      border-radius: 20px;
      padding: 30px;
      max-width: 500px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
      position: relative;
    }
    
    .booking-form-header {
      background: linear-gradient(135deg, #2196F3, #1976D2);
      color: white;
      padding: 20px;
      margin: -30px -30px 20px -30px;
      border-radius: 20px 20px 0 0;
      text-align: center;
    }
    
    .booking-form-header h2 {
      margin: 0;
      font-size: 1.5rem;
    }
    
    .booking-form-header p {
      margin: 5px 0 0 0;
      opacity: 0.9;
      font-size: 0.9rem;
    }
    
    .close-booking-form {
      position: absolute;
      top: 15px;
      right: 20px;
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: white;
      font-size: 20px;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .form-group {
      margin-bottom: 20px;
    }
    
    .form-group label {
      display: block;
      margin-bottom: 8px;
      color: #1565c0;
      font-weight: 600;
      font-size: 14px;
    }
    
    .form-group input,
    .form-group select,
    .form-group textarea {
      width: 100%;
      padding: 12px 15px;
      border: 2px solid #2196f3;
      border-radius: 10px;
      outline: none;
      font-size: 14px;
      background: white;
      color: #333;
      transition: border-color 0.3s ease;
    }
    
    .form-group input:focus,
    .form-group select:focus,
    .form-group textarea:focus {
      border-color: #1976d2;
    }
    
    .date-time-row {
      display: flex;
      gap: 15px;
    }
    
    .date-time-row .form-group {
      flex: 1;
    }
    
    .available-slots {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }
    
    .time-slot {
      padding: 8px 12px;
      background: #e3f2fd;
      border: 2px solid #2196f3;
      border-radius: 8px;
      cursor: pointer;
      font-size: 12px;
      color: #1565c0;
      transition: all 0.3s ease;
    }
    
    .time-slot:hover,
    .time-slot.selected {
      background: #2196f3;
      color: white;
    }
    
    .booking-submit-btn {
      width: 100%;
      padding: 15px;
      background: linear-gradient(135deg, #4caf50, #45a049);
      color: white;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      font-weight: 600;
      font-size: 16px;
      transition: all 0.3s ease;
      margin-top: 10px;
    }
    
    .booking-submit-btn:hover {
      background: linear-gradient(135deg, #45a049, #388e3c);
      transform: translateY(-2px);
    }
    
    .booking-submit-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .mic-button {
      width: 130px;
      height: 130px;
      background: linear-gradient(135deg, #0a192f, #1c2541);
      border: none;
      border-radius: 50%;
      box-shadow: 0 10px 40px rgba(76, 175, 80, 0.3);
      display: flex;
      justify-content: center;
      align-items: center;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      cursor: pointer;
      position: relative;
      overflow: hidden;
      touch-action: manipulation;
      margin: 0 auto 2rem;
    }

    .mic-button:hover {
      transform: scale(1.05);
      box-shadow: 0 15px 50px rgba(76, 175, 80, 0.4);
    }

    .mic-button.listening {
      animation: listening 1.5s infinite;
      background: linear-gradient(135deg, #f44336, #d32f2f);
    }

    .mic-button.processing {
      background: linear-gradient(135deg, #FF9800, #F57C00);
      animation: processing 2s infinite;
    }

    .mic-button.speaking {
      background: linear-gradient(135deg, #4CAF50, #45a049);
      animation: speaking 2s infinite;
    }

    @keyframes listening {
      0% { transform: scale(1); }
      50% { transform: scale(1.05); }
      100% { transform: scale(1); }
    }

    @keyframes processing {
      0%, 100% { transform: rotate(0deg); }
      25% { transform: rotate(90deg); }
      50% { transform: rotate(180deg); }
      75% { transform: rotate(270deg); }
    }

    @keyframes speaking {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.02); }
    }

    .mic-button svg {
      width: 60px;
      height: 60px;
      fill: #ffffff;
    }

    #status {
      font-size: 1.2rem;
      font-weight: 600;
      margin-bottom: 2rem;
      min-height: 3rem;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
    }

    .controls {
      display: flex;
      gap: 1rem;
      justify-content: center;
      margin-bottom: 2rem;
    }

    .control-btn {
      padding: 0.75rem 1.5rem;
      background: rgba(255, 255, 255, 0.2);
      border: none;
      border-radius: 25px;
      color: white;
      cursor: pointer;
      transition: all 0.3s ease;
      font-weight: 500;
      touch-action: manipulation;
      min-height: 44px;
    }

    .control-btn:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: translateY(-2px);
    }

    .control-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .language-selector {
      margin-bottom: 1.5rem;
    }

    .lang-btn {
      padding: 0.5rem 1rem;
      margin: 0 0.25rem;
      background: rgba(255, 255, 255, 0.2);
      border: none;
      border-radius: 15px;
      color: white;
      cursor: pointer;
      transition: all 0.3s ease;
      font-size: 0.9rem;
      touch-action: manipulation;
      min-height: 44px;
    }

    .lang-btn.active {
      background: rgba(76, 175, 80, 0.8);
      transform: scale(1.05);
    }

    .powered-by {
      margin-top: 2rem;
      font-size: 0.9rem;
      opacity: 0.8;
    }

    .claude-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(255, 255, 255, 0.15);
      padding: 0.75rem 1.25rem;
      border-radius: 25px;
      margin-top: 0.75rem;
      transition: all 0.3s ease;
    }

    .claude-badge:hover {
      background: rgba(255, 255, 255, 0.25);
      transform: translateY(-2px);
    }

    .ai-indicator {
      width: 8px;
      height: 8px;
      background: #4CAF50;
      border-radius: 50%;
      animation: aiPulse 2s infinite;
    }

    @keyframes aiPulse {
      0%, 100% { opacity: 0.3; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.2); }
    }

    .error-message {
      background: rgba(244, 67, 54, 0.2);
      border: 1px solid rgba(244, 67, 54, 0.3);
      border-radius: 15px;
      padding: 1rem;
      margin-top: 1rem;
      font-size: 0.9rem;
      opacity: 0;
      transform: translateY(-10px);
      transition: all 0.3s ease;
    }

    .error-message.show {
      opacity: 1;
      transform: translateY(0);
    }

    .subscription-popup-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(10px);
      display: none;
      justify-content: center;
      align-items: center;
      z-index: 2000;
      padding: 20px;
      animation: fadeIn 0.3s ease;
    }

    .subscription-popup-container {
      background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
      border-radius: 25px;
      padding: 40px;
      max-width: 1200px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 30px 60px rgba(0, 0, 0, 0.4);
      position: relative;
      animation: slideUp 0.4s ease;
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .close-subscription-popup {
      position: absolute;
      top: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.1);
      border: none;
      color: #333;
      font-size: 28px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
    }

    .close-subscription-popup:hover {
      background: rgba(0, 0, 0, 0.2);
      transform: rotate(90deg);
    }

    .subscription-header {
      text-align: center;
      margin-bottom: 40px;
    }

    .subscription-header h2 {
      color: #2196F3;
      font-size: 2.5rem;
      margin-bottom: 10px;
      background: linear-gradient(45deg, #2196F3, #4CAF50);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .subscription-header p {
      color: #666;
      font-size: 1.2rem;
    }

    .subscription-plans {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 30px;
      margin-bottom: 30px;
    }

    .plan-card {
      background: white;
      border-radius: 20px;
      padding: 30px;
      position: relative;
      border: 2px solid #e0e0e0;
      transition: all 0.3s ease;
    }

    .plan-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 15px 30px rgba(0, 0, 0, 0.15);
    }

    .plan-card.featured {
      border-color: #4CAF50;
      transform: scale(1.05);
    }

    .plan-badge {
      position: absolute;
      top: -12px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #FF6B6B, #FF8E53);
      color: white;
      padding: 5px 20px;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: bold;
    }

    .plan-card.featured .plan-badge {
      background: linear-gradient(135deg, #4CAF50, #45a049);
    }

    .plan-card h3 {
      color: #333;
      font-size: 1.5rem;
      margin: 20px 0;
      text-align: center;
    }

    .plan-price {
      font-size: 3rem;
      font-weight: bold;
      color: #2196F3;
      text-align: center;
      margin: 20px 0;
    }

    .plan-price span {
      font-size: 1rem;
      color: #666;
      font-weight: normal;
    }

    .plan-features {
      list-style: none;
      padding: 0;
      margin: 20px 0;
    }

    .plan-features li {
      padding: 10px 0;
      color: #555;
      border-bottom: 1px solid #f0f0f0;
    }

    .plan-features li:last-child {
      border-bottom: none;
    }

    .plan-btn {
      width: 100%;
      padding: 15px;
      background: linear-gradient(135deg, #2196F3, #1976D2);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 1.1rem;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .plan-btn:hover {
      background: linear-gradient(135deg, #1976D2, #1565C0);
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(33, 150, 243, 0.3);
    }

    .plan-btn.featured-btn {
      background: linear-gradient(135deg, #4CAF50, #45a049);
    }

    .plan-btn.featured-btn:hover {
      background: linear-gradient(135deg, #45a049, #388e3c);
      box-shadow: 0 10px 20px rgba(76, 175, 80, 0.3);
    }

    .subscription-footer {
      text-align: center;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
    }

    .subscription-footer p {
      color: #666;
      margin-bottom: 15px;
    }

    .contact-sales-btn {
      padding: 12px 30px;
      background: linear-gradient(135deg, #FF6B6B, #FF8E53);
      color: white;
      border: none;
      border-radius: 25px;
      font-size: 1rem;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .contact-sales-btn:hover {
      background: linear-gradient(135deg, #FF8E53, #FF6B6B);
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(255, 107, 107, 0.3);
    }

    @media (max-width: 480px) {
      .container {
        margin: 1rem;
        padding: 1.5rem;
      }
      
      h1 {
        font-size: 2rem;
      }
      
      .mic-button {
        width: 110px;
        height: 110px;
      }
      
      .mic-button svg {
        width: 50px;
        height: 50px;
      }

      .controls {
        flex-direction: column;
        gap: 0.5rem;
      }

      .interface-switcher {
        top: 10px;
        right: 10px;
        font-size: 0.7rem;
        padding: 0.4rem 0.8rem;
      }

      .booking-button {
        top: 10px;
        left: 10px;
        font-size: 0.7rem;
        padding: 0.5rem 1rem;
      }
      
      .booking-form-container {
        margin: 10px;
        max-width: calc(100vw - 20px);
        max-height: calc(100vh - 20px);
        padding: 20px;
      }
      
      .booking-form-header {
        margin: -20px -20px 15px -20px;
        padding: 15px;
      }
      
      .date-time-row {
        flex-direction: column;
        gap: 10px;
      }

      .subscription-popup-container {
        padding: 20px;
      }
      
      .subscription-header h2 {
        font-size: 1.8rem;
      }
      
      .subscription-plans {
        grid-template-columns: 1fr;
        gap: 20px;
      }
      
      .plan-card.featured {
        transform: scale(1);
      }
      
      .plan-card {
        padding: 20px;
      }
      
      .plan-price {
        font-size: 2.5rem;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <button class="booking-button" onclick="window.location.href='/chat-enhanced'">Book Appointment</button>
    <button class="interface-switcher" onclick="window.location.href='/chat'">Try Text Chat</button>
    
    <h1>RinglyPro AI</h1>
    <div class="subtitle">Your Intelligent Business Assistant<br><small style="opacity: 0.8;">Say "book appointment" for instant inline booking • Ask questions • Click "Book"</small></div>
    
    <div class="language-selector">
      <button class="lang-btn active" data-lang="en-US">🇺🇸 English</button>
      <button class="lang-btn" data-lang="es-ES">🇪🇸 Español</button>
    </div>

    <button id="micBtn" class="mic-button" aria-label="Talk to RinglyPro AI">
      <svg xmlns="http://www.w3.org/2000/svg" height="60" viewBox="0 0 24 24" width="60" fill="#ffffff">
        <path d="M0 0h24v24H0V0z" fill="none"/>
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H6c0 3.31 2.69 6 6 6s6-2.69 6-6h-1zm-5 9c-3.87 0-7-3.13-7-7H3c0 5 4 9 9 9s9-4 9-9h-2c0 3.87-3.13 7-7 7z"/>
      </svg>
    </button>
    
    <div id="status">🎙️ Say "book appointment" for instant booking or tap to talk</div>
    
    <div class="controls">
      <button id="stopBtn" class="control-btn" disabled>⏹️ Stop</button>
      <button id="clearBtn" class="control-btn">🗑️ Clear</button>
    </div>

    <div id="errorMessage" class="error-message"></div>
    
    <div class="powered-by">
      Powered by
      <div class="claude-badge">
        <div class="ai-indicator"></div>
        Enhanced Claude AI + Premium TTS
      </div>
    </div>
  </div>

  <!-- Inline Booking Form Overlay -->
  <div id="bookingFormOverlay" class="booking-form-overlay">
    <div class="booking-form-container">
      <div class="booking-form-header">
        <button class="close-booking-form" onclick="closeBookingForm()">×</button>
        <h2>📅 Schedule Your Appointment</h2>
        <p>Fill out the details below to book your consultation</p>
      </div>
      
      <form id="inlineBookingForm">
        <div class="form-group">
          <label>Full Name *</label>
          <input type="text" id="inlineCustomerName" placeholder="Your full name" required>
        </div>
        
        <div class="form-group">
          <label>Email Address *</label>
          <input type="email" id="inlineCustomerEmail" placeholder="your@email.com" required>
        </div>
        
        <div class="form-group">
          <label>Phone Number *</label>
          <input type="tel" id="inlineCustomerPhone" placeholder="(555) 123-4567" required>
        </div>
        
        <div class="form-group">
          <label>Preferred Date *</label>
          <input type="date" id="inlineAppointmentDate" min="" onchange="loadInlineAvailableSlots()" required>
        </div>
        
        <div class="form-group">
          <label>What would you like to discuss?</label>
          <textarea id="inlineAppointmentPurpose" placeholder="Brief description of your needs..." rows="3"></textarea>
        </div>
        
        <div id="inlineTimeSlotsContainer" style="display: none;">
          <label>Available Times *</label>
          <div id="inlineAvailableSlots" class="available-slots"></div>
        </div>
        
        <button type="button" class="booking-submit-btn" onclick="submitInlineBooking()">Book Appointment</button>
      </form>
    </div>
  </div>

  <!-- Subscription Popup Overlay -->
  <div id="subscriptionPopup" class="subscription-popup-overlay" style="display: none;">
    <div class="subscription-popup-container">
      <button class="close-subscription-popup" onclick="closeSubscriptionPopup()">×</button>
      
      <div class="subscription-header">
        <h2>🚀 Start Your RinglyPro Journey</h2>
        <p>Choose the perfect plan for your business</p>
      </div>
      
      <div class="subscription-plans">
        <div class="plan-card">
          <div class="plan-badge">Most Popular</div>
          <h3>Scheduling Assistant</h3>
          <div class="plan-price">$97<span>/month</span></div>
          <ul class="plan-features">
            <li>✅ 1,000 minutes</li>
            <li>✅ 1,000 text messages</li>
            <li>✅ Appointment scheduling</li>
            <li>✅ Call recording</li>
            <li>✅ Email support</li>
          </ul>
          <button class="plan-btn" onclick="selectPlan('starter')">Get Started</button>
        </div>
        
        <div class="plan-card featured">
          <div class="plan-badge">Best Value</div>
          <h3>Office Manager</h3>
          <div class="plan-price">$297<span>/month</span></div>
          <ul class="plan-features">
            <li>✅ 3,000 minutes</li>
            <li>✅ 3,000 text messages</li>
            <li>✅ Everything in Starter</li>
            <li>✅ CRM integrations</li>
            <li>✅ Mobile app</li>
            <li>✅ Priority support</li>
          </ul>
          <button class="plan-btn featured-btn" onclick="selectPlan('pro')">Get Started</button>
        </div>
        
        <div class="plan-card">
          <div class="plan-badge">Premium</div>
          <h3>Marketing Director</h3>
          <div class="plan-price">$497<span>/month</span></div>
          <ul class="plan-features">
            <li>✅ 7,500 minutes</li>
            <li>✅ 7,500 text messages</li>
            <li>✅ Everything in Office Manager</li>
            <li>✅ Dedicated account manager</li>
            <li>✅ Marketing automation</li>
            <li>✅ Custom integrations</li>
          </ul>
          <button class="plan-btn" onclick="selectPlan('premium')">Get Started</button>
        </div>
      </div>
      
      <div class="subscription-footer">
        <p>Questions? Call us at <strong>(888) 610-3810</strong></p>
        <button class="contact-sales-btn" onclick="contactSales()">💬 Talk to Sales</button>
      </div>
    </div>
  </div>

<script>
    // Enhanced Voice Interface JavaScript with PostgreSQL Integration
    class EnhancedVoiceBot {
        constructor() {
            this.micBtn = document.getElementById('micBtn');
            this.status = document.getElementById('status');
            this.stopBtn = document.getElementById('stopBtn');
            this.clearBtn = document.getElementById('clearBtn');
            this.errorMessage = document.getElementById('errorMessage');
            this.langBtns = document.querySelectorAll('.lang-btn');
            
            this.isListening = false;
            this.isProcessing = false;
            this.isPlaying = false;
            this.currentLanguage = 'en-US';
            this.recognition = null;
            this.currentAudio = null;
            this.userInteracted = false;
            this.isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            this.processTimeout = null;
            this.audioContext = null;
            this.recognitionTimeout = null;
            this.mobileAudioEnabled = false;
            
            if (this.isMobile) {
                this.initMobileAudio();
            }
            
            this.init();
        }

        initMobileAudio() {
            console.log('📱 Initializing mobile audio support...');
            
            const enableMobileAudio = () => {
                try {
                    const AudioContext = window.AudioContext || window.webkitAudioContext;
                    if (AudioContext && !this.audioContext) {
                        this.audioContext = new AudioContext();
                    }
                    
                    if (this.audioContext && this.audioContext.state === 'suspended') {
                        this.audioContext.resume().then(() => {
                            console.log('✅ Mobile audio context resumed');
                            this.mobileAudioEnabled = true;
                            this.updateStatus('🎤 Mobile audio ready! Tap to talk');
                        }).catch(err => {
                            console.log('⚠️ Audio context resume failed:', err);
                        });
                    } else if (this.audioContext && this.audioContext.state === 'running') {
                        this.mobileAudioEnabled = true;
                        console.log('✅ Mobile audio context already running');
                    }
                    
                    const testAudio = new Audio();
                    testAudio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N+VQAoUXrTp66hVFApGn+H38GccBz2a2/LCdSMFLIHO8tiJOQcZZ7zs7KFODgtPqOPwtmQdBjuO2fDNeSsF';
                    testAudio.volume = 0.01;
                    testAudio.play().then(() => {
                        console.log('✅ Mobile audio test successful');
                        this.mobileAudioEnabled = true;
                    }).catch(err => {
                        console.log('⚠️ Mobile audio test failed:', err);
                    });
                    
                } catch (error) {
                    console.log('⚠️ Mobile audio init error:', error);
                }
                
                document.removeEventListener('touchstart', enableMobileAudio);
                document.removeEventListener('click', enableMobileAudio);
            };
            
            document.addEventListener('touchstart', enableMobileAudio, { once: true });
            document.addEventListener('click', enableMobileAudio, { once: true });
            
            if (this.micBtn) {
                this.micBtn.addEventListener('touchstart', enableMobileAudio, { once: true });
            }
        }
        async init() {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            
            if (!SpeechRecognition) {
                this.showError('Speech recognition not supported. Please use Chrome or Edge.');
                return;
            }

            this.setupEventListeners();
            this.initSpeechRecognition();
        }

        initSpeechRecognition() {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.lang = this.currentLanguage;

            this.recognition.onstart = () => {
                console.log('Recognition started');
                this.isListening = true;
                this.updateUI('listening');
                this.updateStatus('🎙️ Listening... Speak now');
            };

            this.recognition.onresult = (event) => {
                console.log('Recognition result received');
                if (event.results && event.results.length > 0) {
                    const transcript = event.results[0][0].transcript.trim();
                    console.log('Transcript:', transcript);
                    this.processTranscript(transcript);
                }
            };

            this.recognition.onerror = (event) => {
                console.error('Recognition error:', event.error);
                
                if (event.error === 'no-speech') {
                    this.isListening = false;
                    this.updateUI('ready');
                    this.updateStatus('🎙️ No speech detected. Tap to try again');
                    return;
                }
                
                this.handleError('Speech recognition error: ' + event.error);
            };

            this.recognition.onend = () => {
                console.log('Recognition ended');
                this.isListening = false;
                if (!this.isProcessing) {
                    this.updateUI('ready');
                    this.updateStatus('🎙️ Tap to talk');
                }
            };
        }

        async processTranscript(transcript) {
            if (!transcript || transcript.length < 2) {
                this.handleError('No speech detected');
                return;
            }

            console.log('Processing transcript:', transcript);
            this.isProcessing = true;
            this.updateUI('processing');
            this.updateStatus('🤖 Processing...');
            
            if (this.processTimeout) {
                clearTimeout(this.processTimeout);
            }
            
            this.processTimeout = setTimeout(() => {
                if (this.isProcessing) {
                    console.log('Processing timeout - resetting UI');
                    this.handleError('Processing took too long. Please try again.');
                }
            }, 15000);

            try {
                const response = await fetch('/process-text-enhanced', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: transcript,
                        language: this.currentLanguage,
                        mobile: this.isMobile
                    })
                });

                clearTimeout(this.processTimeout);

                if (!response.ok) throw new Error('Server error: ' + response.status);

                const data = await response.json();
                if (data.error) throw new Error(data.error);

                console.log('Received data:', data);

                if (data.show_text && data.response) {
                    this.updateStatus('💬 ' + data.response.substring(0, 150) + (data.response.length > 150 ? '...' : ''));
                }

                if (data.action === 'show_subscription_popup') {
                    console.log('🎯 Subscription popup triggered');
                    
                    if (data.audio) {
                        console.log('Playing audio response');
                        await this.playPremiumAudio(data.audio, data.response, data.show_text);
                    } else {
                        console.log('No audio, using browser TTS');
                        await this.playBrowserTTS(data.response);
                    }
                    
                    setTimeout(() => {
                        showSubscriptionPopup();
                    }, 500);
                    return;
                }

                if (data.action === 'redirect_to_booking') {
                    console.log('🎯 Booking redirect detected');
                    
                    if (data.audio) {
                        console.log('Playing audio response');
                        await this.playPremiumAudio(data.audio, data.response, data.show_text);
                    } else {
                        console.log('No audio, using browser TTS');
                        await this.playBrowserTTS(data.response);
                    }
                    
                    setTimeout(() => {
                        this.showInlineBookingForm();
                    }, 500);
                    return;
                }

                if (data.audio) {
                    console.log('Playing Rachel audio response');
                    await this.playPremiumAudio(data.audio, data.response, data.show_text);
                } else if (data.response) {
                    console.log('Using browser TTS');
                    await this.playBrowserTTS(data.response);
                } else {
                    this.audioFinished();
                }

            } catch (error) {
                clearTimeout(this.processTimeout);
                this.handleError('Processing error: ' + error.message);
            }
        }

        async playPremiumAudio(audioBase64, responseText, showText = false) {
            console.log('🔊 Playing premium audio - Mobile:', this.isMobile, 'Audio Enabled:', this.mobileAudioEnabled);
            
            if (showText || this.isMobile) {
                this.updateStatus('🔊 ' + responseText);
            }
            
            if (this.isMobile) {
                if (!this.mobileAudioEnabled) {
                    console.log('📱 Mobile audio not ready - using enhanced text mode');
                    this.isPlaying = true;
                    this.updateUI('speaking');
                    
                    const readingTime = Math.min(Math.max(responseText.length * 80, 4000), 12000);
                    console.log(`📱 Mobile reading time: ${readingTime}ms for ${responseText.length} characters`);
                    
                    return new Promise((resolve) => {
                        setTimeout(() => {
                            this.audioFinished();
                            resolve();
                        }, readingTime);
                    });
                }
                
                console.log('📱 Attempting mobile audio playback...');
            }
            
            try {
                const audioData = atob(audioBase64);
                const arrayBuffer = new ArrayBuffer(audioData.length);
                const uint8Array = new Uint8Array(arrayBuffer);
                
                for (let i = 0; i < audioData.length; i++) {
                    uint8Array[i] = audioData.charCodeAt(i);
                }

                const audioBlob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
                const audioUrl = URL.createObjectURL(audioBlob);
                
                this.currentAudio = new Audio(audioUrl);
                
                if (this.isMobile) {
                    this.currentAudio.preload = 'auto';
                    this.currentAudio.volume = 1.0;
                    
                    if (this.audioContext && this.audioContext.state === 'suspended') {
                        await this.audioContext.resume();
                    }
                }
                
                return new Promise((resolve) => {
                    let audioStarted = false;
                    
                    const timeoutDuration = this.isMobile ? 3000 : 5000;
                    const playTimeout = setTimeout(() => {
                        if (!audioStarted) {
                            console.log('⚠️ Audio timeout - fallback to text');
                            this.currentAudio = null;
                            URL.revokeObjectURL(audioUrl);
                            
                            if (!showText && !this.isMobile) {
                                this.updateStatus('💬 ' + responseText.substring(0, 150) + '...');
                            }
                            
                            const fallbackTime = this.isMobile ? 3000 : 2000;
                            setTimeout(() => {
                                this.audioFinished();
                                resolve();
                            }, fallbackTime);
                        }
                    }, timeoutDuration);
                    
                    this.currentAudio.onplay = () => {
                        console.log('✅ Audio started playing');
                        audioStarted = true;
                        clearTimeout(playTimeout);
                        this.isPlaying = true;
                        this.updateUI('speaking');
                        
                        if (!showText && !this.isMobile) {
                            this.updateStatus('🔊 Rachel is speaking...');
                        }
                    };
                    
                    this.currentAudio.onended = () => {
                        console.log('✅ Audio playback completed');
                        clearTimeout(playTimeout);
                        URL.revokeObjectURL(audioUrl);
                        this.audioFinished();
                        resolve();
                    };
                    
                    this.currentAudio.onerror = (error) => {
                        console.error('❌ Audio playback error:', error);
                        clearTimeout(playTimeout);
                        this.currentAudio = null;
                        URL.revokeObjectURL(audioUrl);
                        
                        if (this.isMobile) {
                            this.updateStatus('💬 ' + responseText);
                            console.log('📱 Mobile audio failed - showing text instead');
                        } else if (!showText) {
                            this.updateStatus('💬 ' + responseText.substring(0, 150) + '...');
                        }
                        
                        setTimeout(() => {
                            this.audioFinished();
                            resolve();
                        }, this.isMobile ? 3000 : 2000);
                    };
                    
                    this.currentAudio.play().then(() => {
                        console.log('🎵 Audio play() succeeded');
                    }).catch((error) => {
                        console.log('⚠️ Audio play() failed:', error);
                        clearTimeout(playTimeout);
                        
                        if (this.isMobile) {
                            console.log('📱 Mobile audio play failed - trying alternative approach');
                            
                            setTimeout(() => {
                                if (this.currentAudio) {
                                    this.currentAudio.play().catch(() => {
                                        console.log('📱 Mobile audio retry failed - using text mode');
                                        this.updateStatus('💬 ' + responseText);
                                        setTimeout(() => {
                                            this.audioFinished();
                                            resolve();
                                        }, 3000);
                                    });
                                }
                            }, 100);
                        } else {
                            if (!showText) {
                                this.updateStatus('💬 ' + responseText.substring(0, 150) + '...');
                            }
                            setTimeout(() => {
                                this.audioFinished();
                                resolve();
                            }, 2000);
                        }
                    });
                });
                
            } catch (error) {
                console.error('❌ Premium audio processing failed:', error);
                this.updateStatus('💬 ' + responseText.substring(0, 150) + '...');
                setTimeout(() => {
                    this.audioFinished();
                }, this.isMobile ? 3000 : 2000);
                return Promise.resolve();
            }
        }

        async playBrowserTTS(text) {
            console.log('🔊 Playing browser TTS - Mobile:', this.isMobile);
            
            return new Promise((resolve) => {
                try {
                    if (!('speechSynthesis' in window)) {
                        console.log('⚠️ Speech synthesis not available');
                        this.updateStatus('💬 ' + text);
                        setTimeout(() => {
                            this.audioFinished();
                            resolve();
                        }, this.isMobile ? 4000 : 3000);
                        return;
                    }
                    
                    if (this.isMobile) {
                        console.log('📱 Configuring mobile TTS...');
                        
                        if (this.audioContext && this.audioContext.state === 'suspended') {
                            this.audioContext.resume().catch(err => {
                                console.log('⚠️ Audio context resume failed:', err);
                            });
                        }
                    }
                    
                    const utterance = new SpeechSynthesisUtterance(text);
                    utterance.lang = this.currentLanguage;
                    utterance.rate = 0.9;
                    utterance.pitch = 1.0;
                    utterance.volume = 1.0;
                    
                    if (this.isMobile) {
                        const voices = speechSynthesis.getVoices();
                        if (voices.length > 0) {
                            const femaleVoice = voices.find(voice => 
                                voice.name.toLowerCase().includes('female') || 
                                voice.name.toLowerCase().includes('woman') ||
                                voice.name.toLowerCase().includes('samantha') ||
                                voice.name.toLowerCase().includes('karen')
                            );
                            
                            if (femaleVoice) {
                                utterance.voice = femaleVoice;
                                console.log('📱 Using voice:', femaleVoice.name);
                            }
                        }
                    }
                    
                    utterance.onstart = () => {
                        console.log('🔊 TTS started');
                        this.isPlaying = true;
                        this.updateUI('speaking');
                        this.updateStatus('🔊 Speaking...');
                    };
                    
                    utterance.onend = () => {
                        console.log('✅ TTS completed');
                        this.audioFinished();
                        resolve();
                    };
                    
                    utterance.onerror = (error) => {
                        console.log('⚠️ TTS error:', error);
                        this.updateStatus('💬 ' + text.substring(0, 150) + '...');
                        setTimeout(() => {
                            this.audioFinished();
                            resolve();
                        }, this.isMobile ? 4000 : 3000);
                    };
                    
                    if (this.isMobile) {
                        speechSynthesis.cancel();
                        
                        setTimeout(() => {
                            speechSynthesis.speak(utterance);
                            console.log('📱 Mobile TTS initiated');
                        }, 100);
                    } else {
                        speechSynthesis.speak(utterance);
                    }
                    
                } catch (error) {
                    console.error('❌ Browser TTS error:', error);
                    this.updateStatus('💬 ' + text.substring(0, 150) + '...');
                    setTimeout(() => {
                        this.audioFinished();
                        resolve();
                    }, this.isMobile ? 4000 : 3000);
                }
            });
        }

        audioFinished() {
            console.log('Audio finished');
            this.isPlaying = false;
            this.isProcessing = false;
            this.updateUI('ready');
            this.updateStatus('🎙️ Say "subscribe" or "book appointment" or tap to continue');
        }

        setupEventListeners() {
            this.micBtn.addEventListener('click', () => {
                console.log('Mic button clicked');
                
                if (this.isMobile && !this.mobileAudioEnabled) {
                    this.initMobileAudio();
                }
                
                this.toggleListening();
            });
            
            this.stopBtn.addEventListener('click', () => {
                if (this.isListening) this.stopListening();
                if (this.isPlaying) this.stopAudio();
            });
            
            this.clearBtn.addEventListener('click', () => this.clearAll());
            
            this.langBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    this.changeLanguage(e.target.dataset.lang);
                });
            });
        }

        changeLanguage(lang) {
            this.currentLanguage = lang;
            if (this.recognition) this.recognition.lang = lang;
            
            this.langBtns.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.lang === lang);
            });
        }

        toggleListening() {
            if (this.isListening) {
                this.stopListening();
            } else {
                this.startListening();
            }
        }

        async startListening() {
            if (this.isProcessing || !this.recognition) {
                console.log('Cannot start: processing or no recognition');
                return;
            }
            
            try {
                console.log('Starting speech recognition...');
                
                if (this.isMobile && this.audioContext && this.audioContext.state === 'suspended') {
                    await this.audioContext.resume();
                    console.log('Audio context resumed before listening');
                }
                
                this.clearError();
                speechSynthesis.cancel();
                this.recognition.start();
                this.stopBtn.disabled = false;
                
            } catch (error) {
                console.error('Failed to start:', error);
                this.handleError('Failed to start listening: ' + error.message);
            }
        }

        stopListening() {
            if (this.isListening && this.recognition) {
                this.recognition.stop();
            }
        }

        stopAudio() {
            if (this.currentAudio) {
                this.currentAudio.pause();
                this.currentAudio = null;
            }
            speechSynthesis.cancel();
            this.audioFinished();
        }

        updateUI(state) {
            this.micBtn.className = 'mic-button';
            
            switch (state) {
                case 'listening':
                    this.micBtn.classList.add('listening');
                    this.stopBtn.disabled = false;
                    break;
                case 'processing':
                    this.micBtn.classList.add('processing');
                    this.stopBtn.disabled = false;
                    break;
                case 'speaking':
                    this.micBtn.classList.add('speaking');
                    this.stopBtn.disabled = false;
                    break;
                case 'ready':
                default:
                    this.stopBtn.disabled = true;
                    break;
            }
        }

        updateStatus(message) {
            this.status.textContent = message;
        }

        handleError(message) {
            console.error('Error:', message);
            this.showError(message);
            this.isProcessing = false;
            this.isListening = false;
            this.isPlaying = false;
            this.updateUI('ready');
            
            if (this.processTimeout) {
                clearTimeout(this.processTimeout);
                this.processTimeout = null;
            }
            
            setTimeout(() => {
                this.updateStatus('🎙️ Say "subscribe" or "book appointment" or tap to try again');
            }, 3000);
        }

        showError(message) {
            this.errorMessage.textContent = message;
            this.errorMessage.classList.add('show');
            setTimeout(() => this.clearError(), 8000);
        }

        clearError() {
            this.errorMessage.classList.remove('show');
        }

        showInlineBookingForm() {
            const overlay = document.getElementById('bookingFormOverlay');
            const dateInput = document.getElementById('inlineAppointmentDate');
            
            const today = new Date().toISOString().split('T')[0];
            dateInput.min = today;
            
            overlay.style.display = 'flex';
            
            if (!this.isMobile) {
                setTimeout(() => {
                    document.getElementById('inlineCustomerName').focus();
                }, 100);
            }
            
            this.updateStatus('📅 Fill out the booking form above');
        }

        clearAll() {
            this.stopAudio();
            if (this.isListening) this.stopListening();
            
            if (this.processTimeout) {
                clearTimeout(this.processTimeout);
                this.processTimeout = null;
            }
            
            this.isProcessing = false;
            this.isListening = false;
            this.isPlaying = false;
            this.updateUI('ready');
            this.clearError();
            
            const overlay = document.getElementById('bookingFormOverlay');
            if (overlay) overlay.style.display = 'none';
            
            const subscriptionPopup = document.getElementById('subscriptionPopup');
            if (subscriptionPopup) subscriptionPopup.style.display = 'none';
            
            this.updateStatus('🎙️ Ready! Say "subscribe" or "book appointment"');
        }
    }

    // Subscription Popup Functions
    function showSubscriptionPopup() {
        const popup = document.getElementById('subscriptionPopup');
        if (popup) {
            popup.style.display = 'flex';
            
            setTimeout(() => {
                popup.classList.add('active');
            }, 10);
            
            console.log('📊 Subscription popup shown');
            
            if (window.voiceBot) {
                window.voiceBot.updateStatus('🎯 Choose your perfect plan above!');
            }
        }
    }

    function closeSubscriptionPopup() {
        const popup = document.getElementById('subscriptionPopup');
        if (popup) {
            popup.style.display = 'none';
            
            if (window.voiceBot) {
                window.voiceBot.updateStatus('🎙️ Ready! Say "subscribe" to see plans again');
            }
        }
    }

    function selectPlan(planType) {
        console.log(`📊 Plan selected: ${planType}`);
        
        const subscriptionUrl = `https://ringlypro.com/subscribe?plan=${planType}`;
        
        const planNames = {
            'starter': 'Scheduling Assistant ($97/month)',
            'pro': 'Office Manager ($297/month)',
            'premium': 'Marketing Director ($497/month)'
        };
        
        const selectedPlanName = planNames[planType] || planType;
        
        const container = document.querySelector('.subscription-popup-container');
        if (container) {
            container.innerHTML = `
                <div class="subscription-header" style="padding: 60px 20px;">
                    <h2>🎉 Excellent Choice!</h2>
                    <p style="font-size: 1.3rem; margin: 20px 0;">You selected: <strong>${selectedPlanName}</strong></p>
                    <p style="color: #666; margin-bottom: 30px;">Redirecting you to complete your subscription...</p>
                    <div style="display: flex; gap: 20px; justify-content: center; flex-wrap: wrap;">
                        <button class="plan-btn" style="width: auto; padding: 15px 40px;" onclick="window.open('${subscriptionUrl}', '_blank')">
                            Complete Subscription →
                        </button>
                        <button class="contact-sales-btn" style="width: auto; padding: 15px 40px;" onclick="contactSales()">
                            Talk to Sales First
                        </button>
                    </div>
                    <p style="margin-top: 30px; color: #999;">
                        Or call us directly at <strong>(888) 610-3810</strong>
                    </p>
                </div>
            `;
        }
        
        setTimeout(() => {
            window.open(subscriptionUrl, '_blank');
        }, 2000);
    }

    function contactSales() {
        closeSubscriptionPopup();
        
        if (window.voiceBot && window.voiceBot.showInlineBookingForm) {
            window.voiceBot.showInlineBookingForm();
            
            setTimeout(() => {
                const purposeField = document.getElementById('inlineAppointmentPurpose');
                if (purposeField) {
                    purposeField.value = 'Sales consultation - Interested in RinglyPro subscription plans';
                }
            }, 100);
        } else {
            window.location.href = '/chat-enhanced';
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        try {
            window.voiceBot = new EnhancedVoiceBot();
            console.log('Voice bot initialized successfully');
        } catch (error) {
            console.error('Failed to create voice bot:', error);
        }
    });

    let selectedInlineTimeSlot = null;

    function closeBookingForm() {
        const overlay = document.getElementById('bookingFormOverlay');
        overlay.style.display = 'none';
        if (window.voiceBot) {
            window.voiceBot.updateStatus('🎙️ Ready! Say "book appointment" for instant booking');
        }
    }

    function loadInlineAvailableSlots() {
        const date = document.getElementById('inlineAppointmentDate').value;
        if (!date) return;
        
        fetch('/get-available-slots', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: date })
        })
        .then(response => response.json())
        .then(data => {
            const container = document.getElementById('inlineTimeSlotsContainer');
            const slotsDiv = document.getElementById('inlineAvailableSlots');
            
            if (data.slots && data.slots.length > 0) {
                slotsDiv.innerHTML = '';
                data.slots.forEach(slot => {
                    const slotBtn = document.createElement('div');
                    slotBtn.className = 'time-slot';
                    slotBtn.textContent = formatTimeSlot(slot);
                    slotBtn.onclick = () => selectInlineTimeSlot(slot, slotBtn);
                    slotsDiv.appendChild(slotBtn);
                });
                container.style.display = 'block';
            } else {
                slotsDiv.innerHTML = '<p style="color: #f44336; margin: 10px 0;">No available slots for this date. Please choose another date.</p>';
                container.style.display = 'block';
            }
        })
        .catch(error => {
            console.error('Error loading slots:', error);
        });
    }

    function selectInlineTimeSlot(time, element) {
        document.querySelectorAll('#inlineAvailableSlots .time-slot').forEach(slot => 
            slot.classList.remove('selected')
        );
        element.classList.add('selected');
        selectedInlineTimeSlot = time;
    }

    function formatTimeSlot(time) {
        const [hours, minutes] = time.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
        return `${displayHour}:${minutes} ${ampm}`;
    }

    function submitInlineBooking() {
        const name = document.getElementById('inlineCustomerName').value.trim();
        const email = document.getElementById('inlineCustomerEmail').value.trim();
        const phone = document.getElementById('inlineCustomerPhone').value.trim();
        const date = document.getElementById('inlineAppointmentDate').value;
        const purpose = document.getElementById('inlineAppointmentPurpose').value.trim();
        
        if (!name || !email || !phone || !date || !selectedInlineTimeSlot) {
            alert('Please fill in all required fields and select a time slot.');
            return;
        }
        
        const submitBtn = document.querySelector('.booking-submit-btn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Booking...';
        
        const bookingData = {
            name: name,
            email: email,
            phone: phone,
            date: date,
            time: selectedInlineTimeSlot,
            purpose: purpose || 'General consultation'
        };
        
        fetch('/book-appointment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bookingData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showInlineBookingConfirmation(data.appointment);
            } else {
                showInlineBookingError(data.message);
            }
        })
        .catch(error => {
            console.error('Booking error:', error);
            showInlineBookingError('There was an error booking your appointment. Please try again.');
        })
        .finally(() => {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Book Appointment';
        });
    }

    function showInlineBookingConfirmation(appointment) {
        const container = document.querySelector('.booking-form-container');
        
        const date = new Date(appointment.date + 'T' + appointment.time);
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const formattedDate = date.toLocaleDateString('en-US', options);
        const formattedTime = formatTimeSlot(appointment.time);
        
        container.innerHTML = `
            <div class="booking-form-header">
                <button class="close-booking-form" onclick="closeBookingForm()">×</button>
                <h2>✅ Appointment Confirmed!</h2>
                <p>Your appointment has been successfully scheduled</p>
            </div>
            
            <div style="background: linear-gradient(135deg, #e8f5e8, #c8e6c9); color: #2e7d32; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                <div style="background: white; padding: 15px; border-radius: 8px;">
                    <strong>📅 Date:</strong> ${formattedDate}<br>
                    <strong>🕐 Time:</strong> ${formattedTime} EST<br>
                    <strong>👤 Name:</strong> ${appointment.customer_name}<br>
                    <strong>📧 Email:</strong> ${appointment.customer_email}<br>
                    <strong>📞 Phone:</strong> ${appointment.customer_phone}<br>
                    <strong>🔗 Zoom:</strong> <a href="${appointment.zoom_url}" target="_blank" style="color: #2196F3;">Join Meeting</a><br>
                    <strong>📋 Confirmation:</strong> <span style="font-family: monospace; background: #f0f0f0; padding: 4px 8px; border-radius: 4px;">${appointment.confirmation_code}</span><br>
                    <strong>💬 Purpose:</strong> ${appointment.purpose}
                </div>
                <p style="margin-top: 15px; font-size: 14px;">
                    You'll receive email and SMS confirmations shortly. Save your confirmation code for any changes needed.
                </p>
            </div>
            
            <button type="button" class="booking-submit-btn" onclick="closeBookingForm()" style="background: linear-gradient(135deg, #2196F3, #1976D2);">
                Close & Continue
            </button>
        `;
        
        if (window.voiceBot) {
            window.voiceBot.updateStatus('✅ Appointment booked successfully!');
        }
    }

    function showInlineBookingError(message) {
        const form = document.getElementById('inlineBookingForm');
        
        const existingError = form.querySelector('.error-message');
        if (existingError) existingError.remove();
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.style.cssText = 'background: linear-gradient(135deg, #ffebee, #ffcdd2); border: 2px solid #f44336; color: #c62828; padding: 15px; border-radius: 12px; margin: 15px 0;';
        errorDiv.innerHTML = `<strong>❌ Error:</strong><br>${message}`;
        
        form.insertBefore(errorDiv, form.firstChild);
        errorDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
</script>
</body>
</html>
'''

CHAT_HTML_TEMPLATE = '''
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RinglyPro Chat Assistant</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            body {
    background: white;
}
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        
        .chat-container {
            width: 100%;
            max-width: 500px;
            height: 600px;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(20px);
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            position: relative;
        }
        
        .header {
            background: linear-gradient(135deg, #2196F3, #1976D2);
            color: white;
            padding: 20px;
            text-align: center;
            position: relative;
        }
        
        .interface-switcher {
            position: absolute;
            top: 15px;
            right: 15px;
            background: rgba(255, 255, 255, 0.2);
            border: none;
            border-radius: 12px;
            color: white;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.3s ease;
        }
        
        .interface-switcher:hover {
            background: rgba(255, 255, 255, 0.3);
        }
        
        .header h1 {
            font-size: 1.5rem;
            font-weight: 700;
            margin-bottom: 5px;
        }
        
        .header p {
            opacity: 0.9;
            font-size: 0.9rem;
        }
        
        .chat-messages {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            background: white;
        }
        
        .message {
            margin-bottom: 15px;
            max-width: 85%;
            animation: fadeIn 0.3s ease;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .message.user {
            margin-left: auto;
        }
        
        .message-content {
            padding: 12px 16px;
            border-radius: 18px;
            font-size: 14px;
            line-height: 1.4;
        }
        
        .message.bot .message-content {
            background: #f1f3f4;
            color: #333;
            border-bottom-left-radius: 6px;
        }
        
        .message.user .message-content {
            background: #2196F3;
            color: white;
            text-align: right;
            border-bottom-right-radius: 6px;
        }
        
        .input-area {
            padding: 20px;
            background: white;
            border-top: 1px solid #e0e0e0;
        }
        
        .input-container {
            display: flex;
            gap: 10px;
            align-items: center;
        }
        
        .input-container input {
            flex: 1;
            padding: 12px 16px;
            border: 2px solid #e0e0e0;
            border-radius: 25px;
            outline: none;
            font-size: 14px;
            transition: border-color 0.3s ease;
        }
        
        .input-container input:focus {
            border-color: #2196F3;
        }
        
        .send-btn {
            width: 45px;
            height: 45px;
            background: #2196F3;
            border: none;
            border-radius: 50%;
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            font-size: 18px;
        }
        
        .send-btn:hover {
            background: #1976D2;
            transform: scale(1.05);
        }
        
        .phone-form { 
            background: #fff3e0; 
            border: 2px solid #ff9800; 
            border-radius: 12px; 
            padding: 15px; 
            margin: 10px 0;
        }
        
        .phone-form h4 { color: #e65100; margin-bottom: 8px; font-size: 14px; }
        .phone-form p { color: #bf360c; margin-bottom: 12px; font-size: 13px; }
        
        .phone-inputs { display: flex; gap: 8px; margin-top: 10px; }
        
        .phone-inputs input { 
            flex: 1; 
            padding: 10px; 
            border: 1px solid #ff9800; 
            border-radius: 8px; 
            background: white;
            color: #333;
            outline: none;
        }
        
        .phone-inputs input::placeholder {
            color: #999;
        }
        
        .phone-btn { 
            padding: 10px 16px; 
            background: #4caf50; 
            color: white; 
            border: none; 
            border-radius: 8px; 
            cursor: pointer;
        }
        
        .success { 
            background: #e8f5e8; 
            border: 2px solid #4caf50; 
            color: #2e7d32; 
            padding: 12px; 
            border-radius: 8px; 
            margin: 10px 0;
        }
        
        .error { 
            background: #ffebee; 
            border: 2px solid #f44336; 
            color: #c62828; 
            padding: 12px; 
            border-radius: 8px; 
            margin: 10px 0;
        }

        .chat::-webkit-scrollbar {
            width: 4px;
        }
        
        .chat::-webkit-scrollbar-track {
            background: #f1f1f1;
        }
        
        .chat::-webkit-scrollbar-thumb {
            background: #c1c1c1;
            border-radius: 2px;
        }
        
        .chat::-webkit-scrollbar-thumb:hover {
            background: #a1a1a1;
        }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="header">
            <button class="interface-switcher" onclick="window.location.href='/'">🎤 Voice Chat</button>
            <h1>💬 RinglyPro Assistant</h1>
            <p>Ask me anything about our services!</p>
        </div>
        
        <div class="chat-messages" id="chatMessages">
            <div class="message bot">
                <div class="message-content">
                    👋 Hello! I'm your RinglyPro assistant. Ask me about our services, pricing, features, or how to get started. If I can't answer your question, I'll connect you with our customer service team!
                </div>
            </div>
        </div>
        
        <div class="input-area">
            <div class="input-container">
                <input type="text" id="userInput" placeholder="Ask about RinglyPro services..." onkeypress="handleKeyPress(event)">
                <button class="send-btn" onclick="sendMessage()">→</button>
            </div>
        </div>
    </div>

    <script>
        let isWaitingForResponse = false;

        function handleKeyPress(event) {
            if (event.key === 'Enter' && !isWaitingForResponse) {
                sendMessage();
            }
        }

        function sendMessage() {
            if (isWaitingForResponse) return;
            
            const input = document.getElementById('userInput');
            const message = input.value.trim();
            
            if (!message) return;
            
            addMessage(message, 'user');
            input.value = '';
            showTypingIndicator();
            
            isWaitingForResponse = true;
            
            fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: message })
            })
            .then(response => response.json())
            .then(data => {
                hideTypingIndicator();
                addMessage(data.response, 'bot');
                
                if (data.needs_phone_collection) {
                    setTimeout(() => showPhoneForm(), 500);
                }
                
                isWaitingForResponse = false;
            })
            .catch(error => {
                console.error('Error:', error);
                hideTypingIndicator();
                addMessage('Sorry, there was an error processing your request. Please try again.', 'bot');
                isWaitingForResponse = false;
            });
        }

        function addMessage(message, sender) {
            const chatMessages = document.getElementById('chatMessages');
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${sender}`;
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.textContent = message;
            
            messageDiv.appendChild(contentDiv);
            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        function showTypingIndicator() {
            const chatMessages = document.getElementById('chatMessages');
            const typingDiv = document.createElement('div');
            typingDiv.id = 'typingIndicator';
            typingDiv.className = 'typing-indicator';
            typingDiv.innerHTML = `
                RinglyPro is typing
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            `;
            chatMessages.appendChild(typingDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        function hideTypingIndicator() {
            const typingIndicator = document.getElementById('typingIndicator');
            if (typingIndicator) {
                typingIndicator.remove();
            }
        }

        function showPhoneForm() {
            const chatMessages = document.getElementById('chatMessages');
            const phoneFormDiv = document.createElement('div');
            phoneFormDiv.className = 'phone-form';
            phoneFormDiv.innerHTML = `
                <h4>📞 Let's connect you with our team!</h4>
                <p>Please enter your phone number so our customer service team can provide personalized assistance:</p>
                <div class="phone-inputs">
                    <input type="tel" id="phoneInput" placeholder="(555) 123-4567" style="flex: 1;">
                    <button class="phone-btn" onclick="submitPhone()">Submit</button>
                </div>
            `;
            chatMessages.appendChild(phoneFormDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            setTimeout(() => {
                const phoneInput = document.getElementById('phoneInput');
                if (phoneInput) phoneInput.focus();
            }, 100);
        }

        function submitPhone() {
            const phoneInput = document.getElementById('phoneInput');
            const phoneNumber = phoneInput.value.trim();
            
            if (!phoneNumber) {
                alert('Please enter a phone number.');
                return;
            }
            
            fetch('/submit_phone', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    phone: phoneNumber,
                    last_question: sessionStorage.getItem('lastQuestion') || 'Chat inquiry'
                })
            })
            .then(response => response.json())
            .then(data => {
                const chatMessages = document.getElementById('chatMessages');
                
                const responseDiv = document.createElement('div');
                responseDiv.className = data.success ? 'success-message' : 'error-message';
                responseDiv.innerHTML = `
                    <strong>${data.success ? '✅ Success!' : '❌ Error:'}</strong><br>
                    ${data.message}
                `;
                chatMessages.appendChild(responseDiv);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            })
            .catch(error => {
                console.error('Error:', error);
                alert('There was an error submitting your phone number. Please try again.');
            });
        }

        document.getElementById('userInput').addEventListener('input', function() {
            sessionStorage.setItem('lastQuestion', this.value);
        });
    </script>
</body>
</html>
'''
ENHANCED_CHAT_TEMPLATE = '''
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RinglyPro Appointment Assistant</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            height: 100vh; display: flex; justify-content: center; align-items: center;
        }
        
        .chat-container {
            width: 100%; max-width: 500px; height: 600px;
            background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(20px);
            border-radius: 20px; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            display: flex; flex-direction: column; overflow: hidden; position: relative;
        }
        
        .header {
            background: linear-gradient(135deg, #2196F3, #1976D2); color: white;
            padding: 20px; text-align: center; position: relative;
        }
        
        .interface-switcher {
            position: absolute; top: 15px; right: 15px;
            background: rgba(255, 255, 255, 0.2); border: none; border-radius: 12px;
            color: white; padding: 8px 12px; cursor: pointer; font-size: 12px;
            transition: all 0.3s ease;
        }
        
        .interface-switcher:hover { background: rgba(255, 255, 255, 0.3); }
        
        .header h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 5px; }
        .header p { opacity: 0.9; font-size: 0.9rem; }
        
        .chat-messages {
            flex: 1; padding: 20px; overflow-y: auto; background: white;
        }
        
        .message {
            margin-bottom: 15px; max-width: 85%; animation: fadeIn 0.3s ease;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .message.user { margin-left: auto; }
        
        .message-content {
            padding: 12px 16px; border-radius: 18px; font-size: 14px; line-height: 1.4;
        }
        
        .message.bot .message-content {
            background: #f1f3f4; color: #333; border-bottom-left-radius: 6px;
        }
        
        .message.user .message-content {
            background: #2196F3; color: white; text-align: right; border-bottom-right-radius: 6px;
        }
        
        .booking-form {
            background: linear-gradient(135deg, #e3f2fd, #bbdefb);
            border: 2px solid #2196f3; border-radius: 15px; padding: 20px; margin: 15px 0;
            animation: slideIn 0.5s ease;
        }
        
        @keyframes slideIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .booking-form h4 { color: #0d47a1; margin-bottom: 15px; font-size: 16px; }
        
        .form-group { margin-bottom: 15px; }
        
        .form-group label {
            display: block; margin-bottom: 5px; color: #1565c0; font-weight: 600;
        }
        
        .form-group input, .form-group select, .form-group textarea {
            width: 100%; padding: 10px 12px; border: 2px solid #2196f3;
            border-radius: 10px; outline: none; font-size: 14px;
        }
        
        .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
            border-color: #1976d2;
        }
        
        .date-time-row { display: flex; gap: 10px; }
        .date-time-row .form-group { flex: 1; }
        
        .available-slots {
            display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;
        }
        
        .time-slot {
            padding: 8px 12px; background: #e3f2fd; border: 2px solid #2196f3;
            border-radius: 8px; cursor: pointer; font-size: 12px; color: #1565c0;
            transition: all 0.3s ease;
        }
        
        .time-slot:hover, .time-slot.selected {
            background: #2196f3; color: white;
        }
        
        .submit-btn {
            width: 100%; padding: 12px; background: linear-gradient(135deg, #4caf50, #45a049);
            color: white; border: none; border-radius: 10px; cursor: pointer;
            font-weight: 600; font-size: 14px; transition: all 0.3s ease;
        }
        
        .submit-btn:hover {
            background: linear-gradient(135deg, #45a049, #388e3c);
            transform: translateY(-2px);
        }
        
        .submit-btn:disabled {
            opacity: 0.6; cursor: not-allowed; transform: none;
        }
        
        .input-area {
            padding: 20px; background: white; border-top: 1px solid #e0e0e0;
        }
        
        .input-container {
            display: flex; gap: 10px; align-items: center;
        }
        
        .input-container input {
            flex: 1; padding: 12px 16px; border: 2px solid #e0e0e0;
            border-radius: 25px; outline: none; font-size: 14px;
            transition: border-color 0.3s ease;
        }
        
        .input-container input:focus { border-color: #2196F3; }
        
        .send-btn {
            width: 45px; height: 45px; background: #2196F3; border: none;
            border-radius: 50%; color: white; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.3s ease; font-size: 18px;
        }
        
        .send-btn:hover {
            background: #1976D2; transform: scale(1.05);
        }
        
        .success-message {
            background: linear-gradient(135deg, #e8f5e8, #c8e6c9);
            border: 2px solid #4caf50; color: #2e7d32;
            padding: 15px; border-radius: 12px; margin: 15px 0;
        }
        
        .error-message {
            background: linear-gradient(135deg, #ffebee, #ffcdd2);
            border: 2px solid #f44336; color: #c62828;
            padding: 15px; border-radius: 12px; margin: 15px 0;
        }
        
        .chat-messages::-webkit-scrollbar { width: 4px; }
        .chat-messages::-webkit-scrollbar-track { background: #f1f1f1; }
        .chat-messages::-webkit-scrollbar-thumb { background: #c1c1c1; border-radius: 2px; }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="header">
            <button class="interface-switcher" onclick="window.location.href='/'">Voice Chat</button>
            <h1>RinglyPro Booking Assistant</h1>
            <p>Schedule appointments & get answers instantly!</p>
        </div>
        
        <div class="chat-messages" id="chatMessages">
            <div class="message bot">
                <div class="message-content">
                    Hello! I'm your RinglyPro booking assistant. I can help you:
                    
                    Schedule a free consultation
                    Answer questions about our services
                    Explain our pricing plans
                    Describe our features
                    
                    Just type "book appointment" or ask me anything!
                </div>
            </div>
        </div>
        
        <div class="input-area">
            <div class="input-container">
                <input type="text" id="userInput" placeholder="Type 'book appointment' or ask a question..." onkeypress="handleKeyPress(event)">
                <button class="send-btn" onclick="sendMessage()">→</button>
            </div>
        </div>
    </div>

    <script>
        let isWaitingForResponse = false;
        let bookingStep = 'none';
        let bookingData = {};
        let selectedTimeSlot = null;

        function handleKeyPress(event) {
            if (event.key === 'Enter' && !isWaitingForResponse) {
                sendMessage();
            }
        }

        function sendMessage() {
            if (isWaitingForResponse) return;
            
            const input = document.getElementById('userInput');
            const message = input.value.trim();
            
            if (!message) return;
            
            addMessage(message, 'user');
            input.value = '';
            
            isWaitingForResponse = true;
            
            fetch('/chat-enhanced', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: message,
                    booking_step: bookingStep,
                    booking_data: bookingData
                })
            })
            .then(response => response.json())
            .then(data => {
                console.log('Response data:', data);
                
                addMessage(data.response, 'bot');
                
                if (data.action === 'start_booking') {
                    console.log('Starting booking process');
                    bookingStep = 'form_ready';
                    setTimeout(() => showBookingForm(), 500);
                } else if (data.booking_step) {
                    bookingStep = data.booking_step;
                }
                
                isWaitingForResponse = false;
            })
            .catch(error => {
                console.error('Error:', error);
                addMessage('Sorry, there was an error. Please try again.', 'bot');
                isWaitingForResponse = false;
            });
        }

        function addMessage(message, sender) {
            const chatMessages = document.getElementById('chatMessages');
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${sender}`;
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            contentDiv.textContent = message;
            
            messageDiv.appendChild(contentDiv);
            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }

        function showBookingForm() {
            const chatMessages = document.getElementById('chatMessages');
            const formDiv = document.createElement('div');
            formDiv.className = 'booking-form';
            formDiv.innerHTML = `
                <h4>Schedule Your Free Consultation</h4>
                <form id="appointmentForm">
                    <div class="form-group">
                        <label>Full Name *</label>
                        <input type="text" id="customerName" required>
                    </div>
                    
                    <div class="form-group">
                        <label>Email Address *</label>
                        <input type="email" id="customerEmail" required>
                    </div>
                    
                    <div class="form-group">
                        <label>Phone Number *</label>
                        <input type="tel" id="customerPhone" placeholder="(555) 123-4567" required>
                    </div>
                    
                    <div class="date-time-row">
                        <div class="form-group">
                            <label>Preferred Date *</label>
                            <input type="date" id="appointmentDate" min="${new Date().toISOString().split('T')[0]}" onchange="loadAvailableSlots()" required>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label>What would you like to discuss?</label>
                        <textarea id="appointmentPurpose" rows="3" placeholder="Brief description of your needs..."></textarea>
                    </div>
                    
                    <div id="timeSlotsContainer" style="display: none;">
                        <label>Available Times *</label>
                        <div id="availableSlots" class="available-slots"></div>
                    </div>
                    
                    <button type="button" class="submit-btn" onclick="submitBooking()">Book Appointment</button>
                </form>
            `;
            
            chatMessages.appendChild(formDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            setTimeout(() => {
                document.getElementById('customerName').focus();
            }, 100);
        }

        function loadAvailableSlots() {
            const date = document.getElementById('appointmentDate').value;
            if (!date) return;
            
            fetch('/get-available-slots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: date })
            })
            .then(response => response.json())
            .then(data => {
                const container = document.getElementById('timeSlotsContainer');
                const slotsDiv = document.getElementById('availableSlots');
                
                if (data.slots && data.slots.length > 0) {
                    slotsDiv.innerHTML = '';
                    data.slots.forEach(slot => {
                        const slotBtn = document.createElement('div');
                        slotBtn.className = 'time-slot';
                        slotBtn.textContent = formatTimeSlot(slot);
                        slotBtn.onclick = () => selectTimeSlot(slot, slotBtn);
                        slotsDiv.appendChild(slotBtn);
                    });
                    container.style.display = 'block';
                } else {
                    slotsDiv.innerHTML = '<p style="color: #f44336;">No available slots for this date. Please choose another date.</p>';
                    container.style.display = 'block';
                }
            })
            .catch(error => {
                console.error('Error loading slots:', error);
            });
        }

        function selectTimeSlot(time, element) {
            document.querySelectorAll('.time-slot').forEach(slot => {
                slot.classList.remove('selected');
            });
            
            element.classList.add('selected');
            selectedTimeSlot = time;
        }

        function formatTimeSlot(time) {
            const [hours, minutes] = time.split(':');
            const hour = parseInt(hours);
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
            return `${displayHour}:${minutes} ${ampm}`;
        }

        function submitBooking() {
            const name = document.getElementById('customerName').value.trim();
            const email = document.getElementById('customerEmail').value.trim();
            const phone = document.getElementById('customerPhone').value.trim();
            const date = document.getElementById('appointmentDate').value;
            const purpose = document.getElementById('appointmentPurpose').value.trim();
            
            if (!name || !email || !phone || !date || !selectedTimeSlot) {
                alert('Please fill in all required fields and select a time slot.');
                return;
            }
            
            const submitBtn = document.querySelector('.submit-btn');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Booking...';
            
            const bookingData = {
                name: name,
                email: email,
                phone: phone,
                date: date,
                time: selectedTimeSlot,
                purpose: purpose || 'General consultation'
            };
            
            fetch('/book-appointment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookingData)
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showBookingConfirmation(data.appointment);
                } else {
                    showBookingError(data.message);
                }
            })
            .catch(error => {
                console.error('Booking error:', error);
                showBookingError('There was an error booking your appointment. Please try again.');
            })
            .finally(() => {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Book Appointment';
            });
        }

        function showBookingConfirmation(appointment) {
            const chatMessages = document.getElementById('chatMessages');
            
            const bookingForm = document.querySelector('.booking-form');
            if (bookingForm) bookingForm.remove();
            
            const date = new Date(appointment.date + 'T' + appointment.time);
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            const formattedDate = date.toLocaleDateString('en-US', options);
            const formattedTime = formatTimeSlot(appointment.time);
            
            const confirmDiv = document.createElement('div');
            confirmDiv.className = 'success-message';
            confirmDiv.innerHTML = `
                <strong>Appointment Confirmed!</strong><br><br>
                Date: ${formattedDate}<br>
                Time: ${formattedTime} EST<br>
                Name: ${appointment.customer_name}<br>
                Email: ${appointment.customer_email}<br>
                Phone: ${appointment.customer_phone}<br>
                Zoom Link: <a href="${appointment.zoom_url}" target="_blank" style="color: #2196F3;">Join Meeting</a><br>
                Confirmation Code: ${appointment.confirmation_code}<br><br>
                
                You'll receive email and SMS confirmations shortly. Save your confirmation code for any changes.
            `;
            
            chatMessages.appendChild(confirmDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            bookingStep = 'none';
            bookingData = {};
            selectedTimeSlot = null;
        }

        function showBookingError(message) {
            const chatMessages = document.getElementById('chatMessages');
            
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.innerHTML = `<strong>Booking Error:</strong><br>${message}`;
            
            chatMessages.appendChild(errorDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    </script>
</body>
</html>
'''

# ==================== ROUTES (POSTGRESQL VIA CRM API) ====================

@app.route('/')
def serve_index():
    """Voice interface"""
    return render_template_string(VOICE_HTML_TEMPLATE)

@app.route('/chat')
def serve_chat():
    """Text chat interface"""
    return render_template_string(CHAT_HTML_TEMPLATE)

@app.route('/chat-enhanced')
def serve_enhanced_chat():
    """Enhanced chat interface with appointment booking"""
    return render_template_string(ENHANCED_CHAT_TEMPLATE)

@app.route('/chat', methods=['POST'])
def handle_chat():
    """Handle chat messages with SMS integration - PostgreSQL backend"""
    try:
        data = request.get_json()
        user_message = data.get('message', '').strip()
        
        if not user_message:
            return jsonify({'response': 'Please enter a question.', 'needs_phone_collection': False})
        
        session['last_question'] = user_message
        
        logger.info(f"Chat message received: {user_message}")
        
        response, is_faq_match, needs_phone_collection = get_faq_response_with_sms(user_message)
        
        logger.info(f"FAQ match: {is_faq_match}, Phone collection needed: {needs_phone_collection}")
        
        return jsonify({
            'response': response,
            'needs_phone_collection': needs_phone_collection,
            'is_faq_match': is_faq_match
        })
        
    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        return jsonify({
            'response': 'Sorry, there was an error processing your request. Please try again.',
            'needs_phone_collection': False
        }), 500

@app.route('/chat-enhanced', methods=['POST'])
def handle_enhanced_chat():
    """Enhanced chat handler with appointment booking capabilities - PostgreSQL backend"""
    try:
        data = request.get_json()
        user_message = data.get('message', '').strip()
        booking_step = data.get('booking_step', 'none')
        booking_data = data.get('booking_data', {})
        
        if not user_message:
            return jsonify({'response': 'Please enter a question.', 'action': 'none'})
        
        logger.info(f"Enhanced chat message: {user_message}")
        logger.info(f"Current booking step: {booking_step}")
        
        user_message_lower = user_message.lower().strip()
        
        if booking_step == 'awaiting_confirmation':
            logger.info("Processing follow-up response")
            if user_message_lower in ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'y']:
                logger.info("User confirmed booking")
                return jsonify({
                    'response': 'Perfect! Let me set up the booking form for you.',
                    'action': 'start_booking',
                    'booking_step': 'form_ready',
                    'is_faq_match': True
                })
            elif user_message_lower in ['no', 'nope', 'not now', 'maybe later', 'n']:
                logger.info("User declined booking")
                return jsonify({
                    'response': 'No problem! Feel free to ask me any questions about RinglyPro services, or let me know if you change your mind about scheduling.',
                    'action': 'none',
                    'booking_step': 'none',
                    'is_faq_match': True
                })
        
        response, is_faq_match, action_needed = get_enhanced_faq_response(user_message)
        
        logger.info(f"Response: {response[:50]}...")
        logger.info(f"Action needed: {action_needed}")
        
        response_data = {
            'response': response,
            'is_faq_match': is_faq_match,
            'action': action_needed,
            'booking_step': booking_step
        }
        
        if action_needed == "start_booking":
            logger.info("Setting action to start_booking")
            response_data['action'] = 'start_booking'
            response_data['booking_step'] = 'form_ready'
        elif action_needed == "suggest_booking":
            response_data['response'] += " Type 'yes' if you'd like to schedule a consultation."
            response_data['booking_step'] = 'awaiting_confirmation'
        elif action_needed == "offer_booking":
            response_data['booking_step'] = 'awaiting_confirmation'
        
        logger.info(f"Final response data: {response_data}")
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"Error in enhanced chat endpoint: {str(e)}")
        return jsonify({
            'response': 'Sorry, there was an error processing your request. Please try again.',
            'action': 'none'
        }), 500

@app.route('/get-available-slots', methods=['POST'])
def get_available_slots():
    """Get available appointment slots for a date - PostgreSQL backend"""
    try:
        data = request.get_json()
        date = data.get('date')
        
        if not date:
            return jsonify({'error': 'Date is required'}), 400
        
        appointment_manager = AppointmentManager()
        slots = appointment_manager.get_available_slots(date)
        
        return jsonify({
            'success': True,
            'date': date,
            'slots': slots
        })
        
    except Exception as e:
        logger.error(f"Error getting available slots from PostgreSQL: {e}")
        return jsonify({'error': 'Failed to get available slots'}), 500

@app.route('/book-appointment', methods=['POST'])
def book_appointment():
    """Book a new appointment - PostgreSQL backend"""
    try:
        data = request.get_json()
        
        appointment_manager = AppointmentManager()
        success, message, appointment = appointment_manager.book_appointment(data)
        
        if success:
            return jsonify({
                'success': True,
                'message': message,
                'appointment': appointment
            })
        else:
            return jsonify({
                'success': False,
                'message': message
            }), 400
            
    except Exception as e:
        logger.error(f"Error booking appointment in PostgreSQL: {e}")
        return jsonify({
            'success': False,
            'message': 'Failed to book appointment'
        }), 500

@app.route('/appointment/<confirmation_code>')
def get_appointment(confirmation_code):
    """Get appointment details by confirmation code - PostgreSQL backend"""
    try:
        appointment_manager = AppointmentManager()
        appointment = appointment_manager.get_appointment_by_code(confirmation_code)
        
        if appointment:
            return jsonify({
                'success': True,
                'appointment': appointment
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Appointment not found'
            }), 404
            
    except Exception as e:
        logger.error(f"Error getting appointment from PostgreSQL: {e}")
        return jsonify({
            'success': False,
            'message': 'Failed to retrieve appointment'
        }), 500

@app.route('/submit_phone', methods=['POST'])
def submit_phone():
    """Handle phone number submission and send SMS notification - PostgreSQL backend"""
    try:
        data = request.get_json()
        phone_number = data.get('phone', '').strip()
        last_question = data.get('last_question', session.get('last_question', 'General inquiry'))
        
        if not phone_number:
            return jsonify({
                'success': False,
                'message': 'Please provide a phone number.'
            })
        
        validated_phone = validate_phone_number(phone_number)
        if not validated_phone:
            return jsonify({
                'success': False,
                'message': 'Please enter a valid phone number (e.g., (555) 123-4567).'
            })
        
        logger.info(f"Phone submitted: {validated_phone}, Question: {last_question}")
        
        sms_success, sms_result = send_sms_notification(validated_phone, last_question)
        
        # Save to PostgreSQL via CRM API
        db_saved = save_customer_inquiry(validated_phone, last_question, sms_success, sms_result)
        
        if sms_success:
            success_message = f'Perfect! We\'ve received your phone number ({validated_phone}) and notified our customer service team about your question: "{last_question}". They\'ll reach out to you shortly to provide personalized assistance.'
        else:
            success_message = f'Thank you for providing your phone number ({validated_phone}). We\'ve recorded your inquiry about "{last_question}" and our customer service team will contact you soon.'
        
        return jsonify({
            'success': True,
            'message': success_message
        })
            
    except Exception as e:
        logger.error(f"Error in submit_phone endpoint: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'There was an error processing your request. Please try again or contact us directly at (656) 213-3300.'
        })

@app.route('/test-appointment-system', methods=['GET'])
def test_appointment_system():
    """Test appointment system configuration and integrations - PostgreSQL backend"""
    try:
        results = {
            "timestamp": datetime.now().isoformat(),
            "configurations": {},
            "tests": {}
        }
        
        results["configurations"] = {
            "crm_api": {
                "base_url": CRM_BASE_URL,
                "configured": True
            },
            "hubspot": {
                "api_token_configured": bool(hubspot_api_token),
                "token_preview": hubspot_api_token[:20] + "..." if hubspot_api_token else None,
                "portal_id": hubspot_portal_id,
                "owner_id": hubspot_owner_id
            },
            "email": {
                "smtp_server": smtp_server,
                "smtp_port": smtp_port,
                "email_user_configured": bool(email_user),
                "email_password_configured": bool(email_password),
                "from_email": from_email
            },
            "twilio": {
                "account_sid_configured": bool(twilio_account_sid),
                "auth_token_configured": bool(twilio_auth_token),
                "phone_number": twilio_phone
            },
            "zoom": {
                "meeting_url": zoom_meeting_url,
                "meeting_id": zoom_meeting_id,
                "password": zoom_password
            }
        }
        
        # Test PostgreSQL connection via CRM API
        crm_test = init_crm_connection()
        results["tests"]["postgresql_via_crm"] = {
            "success": crm_test,
            "message": "PostgreSQL connection via CRM API successful" if crm_test else "PostgreSQL connection failed"
        }
        
        # Test HubSpot connection
        if hubspot_api_token:
            hubspot_service = HubSpotService()
            hubspot_test = hubspot_service.test_connection()
            results["tests"]["hubspot"] = hubspot_test
        else:
            results["tests"]["hubspot"] = {"success": False, "error": "No API token configured"}
        
        # Test email configuration
        if email_user and email_password:
            try:
                import smtplib
                server = smtplib.SMTP(smtp_server, smtp_port)
                server.starttls()
                server.login(email_user, email_password)
                server.quit()
                results["tests"]["email"] = {"success": True, "message": "Email configuration valid"}
            except Exception as e:
                results["tests"]["email"] = {"success": False, "error": str(e)}
        else:
            results["tests"]["email"] = {"success": False, "error": "Email credentials not configured"}
        
        # Test Twilio configuration
        if twilio_account_sid and twilio_auth_token:
            try:
                from twilio.rest import Client
                client = Client(twilio_account_sid, twilio_auth_token)
                account = client.api.accounts(twilio_account_sid).fetch()
                results["tests"]["twilio"] = {
                    "success": True, 
                    "message": "Twilio configuration valid",
                    "account_status": account.status
                }
            except Exception as e:
                results["tests"]["twilio"] = {"success": False, "error": str(e)}
        else:
            results["tests"]["twilio"] = {"success": False, "error": "Twilio credentials not configured"}
        
        # Check recent appointments in PostgreSQL via CRM API
        try:
            appointments_result = crm_client._make_request('GET', '/appointments')
            if appointments_result and appointments_result.get('success'):
                appointments = appointments_result.get('appointments', [])
                results["recent_postgresql_appointments"] = appointments[:5]
            else:
                results["postgresql_error"] = "Failed to fetch appointments from PostgreSQL"
        except Exception as e:
            results["postgresql_error"] = str(e)
        
        # Format as HTML for easy reading
        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Appointment System Test - PostgreSQL Backend</title>
            <style>
                body {{ font-family: monospace; padding: 20px; background: #f0f0f0; }}
                .success {{ color: green; font-weight: bold; }}
                .error {{ color: red; font-weight: bold; }}
                .warning {{ color: orange; font-weight: bold; }}
                pre {{ background: white; padding: 15px; border-radius: 5px; }}
                h2 {{ color: #2196F3; }}
            </style>
        </head>
        <body>
            <h1>Appointment System Configuration Test - PostgreSQL Backend</h1>
            <h2>Environment Status:</h2>
            <pre>{json.dumps(results["configurations"], indent=2)}</pre>
            
            <h2>Integration Tests:</h2>
            <pre>{json.dumps(results["tests"], indent=2)}</pre>
            
            <h2>Recent PostgreSQL Appointments:</h2>
            <pre>{json.dumps(results.get("recent_postgresql_appointments", []), indent=2)}</pre>
            
            <h2>Quick Fix Checklist:</h2>
            <ul>
        """
        
        # Add recommendations based on test results
        if not results["tests"].get("postgresql_via_crm", {}).get("success"):
            html += "<li class='error'>PostgreSQL: Check CRM API connection</li>"
        else:
            html += "<li class='success'>PostgreSQL: Connected via CRM API</li>"
            
        if not results["tests"].get("hubspot", {}).get("success"):
            html += "<li class='error'>HubSpot: Check HUBSPOT_ACCESS_TOKEN environment variable</li>"
        else:
            html += "<li class='success'>HubSpot: Connected</li>"
            
        if not results["tests"].get("email", {}).get("success"):
            html += "<li class='error'>Email: Check EMAIL_USER and EMAIL_PASSWORD environment variables</li>"
        else:
            html += "<li class='success'>Email: Connected</li>"
            
        if not results["tests"].get("twilio", {}).get("success"):
            html += "<li class='error'>Twilio: Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables</li>"
        else:
            html += "<li class='success'>Twilio: Connected</li>"
        
        html += """
            </ul>
            <h2>Test Booking (PostgreSQL):</h2>
            <button onclick="testBooking()">Test Book Appointment</button>
            <div id="result"></div>
            
            <script>
            function testBooking() {
                fetch('/book-appointment', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        name: 'Test User',
                        email: 'test@example.com',
                        phone: '(555) 123-4567',
                        date: new Date().toISOString().split('T')[0],
                        time: '14:00',
                        purpose: 'PostgreSQL system test booking'
                    })
                })
                .then(r => r.json())
                .then(data => {
                    document.getElementById('result').innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
                });
            }
            </script>
        </body>
        </html>
        """
        
        return html
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/process-text-enhanced', methods=['POST'])
def process_text_enhanced():
    """Enhanced text processing with premium audio and subscription detection"""
    logger.info("Enhanced text processing request")
    
    try:
        data = request.get_json()
        
        if not data or 'text' not in data:
            logger.error("Missing text data")
            return jsonify({"error": "Missing text data"}), 400
            
        user_text = data['text'].strip()
        user_language = data.get('language', 'en-US')
        is_mobile = data.get('mobile', False)
        
        # Backend echo detection
        echo_phrases = [
            'ringly pro', 'i can help', 'scheduling', 'perfect', 'wonderful',
            'how can i help', 'i\'m here to help', 'that\'s great', 'absolutely'
        ]
        
        user_lower = user_text.lower()
        is_echo = any(phrase in user_lower for phrase in echo_phrases) and len(user_text) > 30
        
        if is_echo:
            logger.warning(f"Echo detected: {user_text[:50]}...")
            return jsonify({
                "response": "I think I heard an echo. Please speak again.",
                "language": user_language,
                "context": "clarification",
                "show_text": is_mobile
            })
        
        if not user_text or len(user_text) < 2:
            error_msg = ("Texto muy corto. Por favor intenta de nuevo." 
                        if user_language.startswith('es') 
                        else "Text too short. Please try again.")
            return jsonify({"error": error_msg}), 400
        
        logger.info(f"Processing: {user_text}")
        
        # Check for subscription intent FIRST
        subscription_keywords = [
            'subscribe', 'subscription', 'sign up', 'signup', 'get started',
            'join', 'register', 'start service', 'want to subscribe',
            'i want to subscribe', 'interested in subscribing', 'how to subscribe',
            'ready to subscribe', 'start my subscription', 'become a member'
        ]
        
        subscription_detected = any(keyword in user_lower for keyword in subscription_keywords)
        
        if subscription_detected:
            logger.info("Subscription intent detected in voice!")
            subscription_response = "Wonderful! I'm excited to help you get started with RinglyPro. I'm opening our subscription options for you right now. You'll see our plans and can choose the one that best fits your business needs."
            
            audio_data = None
            engine_used = "browser_fallback"
            
            if elevenlabs_api_key:
                try:
                    voice_id = "21m00Tcm4TlvDq8ikWAM"
                    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
                    
                    headers = {
                        "Accept": "audio/mpeg",
                        "Content-Type": "application/json",
                        "xi-api-key": elevenlabs_api_key
                    }
                    
                    tts_data = {
                        "text": subscription_response,
                        "model_id": "eleven_monolingual_v1",
                        "voice_settings": {
                            "stability": 0.5,
                            "similarity_boost": 0.75
                        }
                    }
                    
                    timeout = 10
                    tts_response = requests.post(url, json=tts_data, headers=headers, timeout=timeout)
                    
                    if tts_response.status_code == 200 and len(tts_response.content) > 1000:
                        audio_data = base64.b64encode(tts_response.content).decode('utf-8')
                        engine_used = "elevenlabs_rachel"
                        logger.info("Rachel's voice audio generated for subscription")
                    else:
                        logger.warning(f"ElevenLabs failed: {tts_response.status_code}")
                    
                except Exception as tts_error:
                    logger.error(f"ElevenLabs Rachel error: {tts_error}")
            
            response_payload = {
                "response": subscription_response,
                "language": user_language,
                "context": "subscription_redirect",
                "action": "show_subscription_popup",
                "engine_used": engine_used,
                "show_text": True
            }
            
            if audio_data:
                response_payload["audio"] = audio_data
                logger.info("Subscription response with Rachel's voice")
            else:
                logger.info("Subscription response with browser TTS fallback")
            
            return jsonify(response_payload)
            # Check for appointment booking intent
        booking_keywords = [
            'book', 'schedule', 'appointment', 'meeting', 'consultation',
            'available', 'calendar', 'time', 'when can', 'set up',
            'book an', 'make an appointment', 'schedule a meeting'
        ]
        
        booking_detected = any(keyword in user_lower for keyword in booking_keywords)
        
        if booking_detected:
            logger.info("Booking intent detected in voice!")
            booking_response = "Perfect! I'd be happy to help you schedule a consultation. Let me open the booking form for you right now where you can select your preferred date and time."
            
            audio_data = None
            engine_used = "browser_fallback"
            
            if elevenlabs_api_key:
                try:
                    voice_id = "21m00Tcm4TlvDq8ikWAM"
                    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
                    
                    headers = {
                        "Accept": "audio/mpeg",
                        "Content-Type": "application/json",
                        "xi-api-key": elevenlabs_api_key
                    }
                    
                    tts_data = {
                        "text": booking_response,
                        "model_id": "eleven_monolingual_v1",
                        "voice_settings": {
                            "stability": 0.5,
                            "similarity_boost": 0.75
                        }
                    }
                    
                    tts_response = requests.post(url, json=tts_data, headers=headers, timeout=10)
                    
                    if tts_response.status_code == 200 and len(tts_response.content) > 1000:
                        audio_data = base64.b64encode(tts_response.content).decode('utf-8')
                        engine_used = "elevenlabs_rachel"
                        logger.info("Rachel's voice audio generated for booking")
                    
                except Exception as tts_error:
                    logger.error(f"ElevenLabs booking error: {tts_error}")
            
            response_payload = {
                "response": booking_response,
                "language": user_language,
                "context": "booking_redirect",
                "action": "redirect_to_booking",
                "engine_used": engine_used,
                "show_text": True
            }
            
            if audio_data:
                response_payload["audio"] = audio_data
            
            return jsonify(response_payload)
        
        # For other queries, process through FAQ system
        response, is_faq_match = get_faq_response(user_text)
        
        if not is_faq_match or is_no_answer_response(response):
            log_inquiry_to_crm(
                phone="voice_inquiry",
                question=user_text,
                source="voice"
            )
        
        # Generate audio response
        audio_data = None
        engine_used = "browser_fallback"
        
        if elevenlabs_api_key:
            try:
                voice_id = "21m00Tcm4TlvDq8ikWAM"
                url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
                
                headers = {
                    "Accept": "audio/mpeg",
                    "Content-Type": "application/json",
                    "xi-api-key": elevenlabs_api_key
                }
                
                speech_text = response.replace("RinglyPro", "Ringly Pro")
                speech_text = speech_text.replace("AI", "A.I.")
                speech_text = speech_text.replace("$", " dollars")
                
                tts_data = {
                    "text": speech_text,
                    "model_id": "eleven_monolingual_v1",
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.75
                    }
                }
                
                tts_response = requests.post(url, json=tts_data, headers=headers, timeout=10)
                
                if tts_response.status_code == 200 and len(tts_response.content) > 1000:
                    audio_data = base64.b64encode(tts_response.content).decode('utf-8')
                    engine_used = "elevenlabs_rachel"
                    logger.info("Rachel's voice audio generated successfully")
                else:
                    logger.warning(f"ElevenLabs failed: {tts_response.status_code}")
                
            except Exception as tts_error:
                logger.error(f"ElevenLabs error: {tts_error}")
        
        response_payload = {
            "response": response,
            "language": user_language,
            "context": "general_inquiry",
            "is_faq_match": is_faq_match,
            "engine_used": engine_used,
            "show_text": is_mobile
        }
        
        if audio_data:
            response_payload["audio"] = audio_data
        
        return jsonify(response_payload)
        
    except Exception as e:
        logger.error(f"Enhanced text processing error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        
        error_response = ("Lo siento, hubo un error. Por favor intenta de nuevo." 
                         if data.get('language', '').startswith('es') 
                         else "Sorry, there was an error. Please try again.")
        
        return jsonify({
            "response": error_response,
            "language": data.get('language', 'en-US'),
            "context": "error",
            "show_text": True
        }), 500

# ==================== TWILIO PHONE WEBHOOK ROUTES ====================

@app.route('/phone/webhook', methods=['POST'])
def phone_webhook():
    """Main Twilio webhook for incoming calls"""
    try:
        logger.info("Incoming call received")
        
        # Log call data to PostgreSQL via CRM webhook
        call_data = {
            'CallSid': request.form.get('CallSid'),
            'From': request.form.get('From'),
            'To': request.form.get('To'),
            'CallStatus': request.form.get('CallStatus'),
            'Direction': request.form.get('Direction', 'inbound'),
            'AccountSid': request.form.get('AccountSid')
        }
        
        send_call_data_to_crm(call_data)
        
        # Create phone handler and generate greeting
        phone_handler = PhoneCallHandler()
        response = phone_handler.create_greeting_response()
        
        return str(response), 200, {'Content-Type': 'text/xml'}
        
    except Exception as e:
        logger.error(f"Phone webhook error: {e}")
        response = VoiceResponse()
        response.say("Sorry, there was a technical issue. Please call back.", voice='Polly.Joanna')
        return str(response), 200, {'Content-Type': 'text/xml'}

@app.route('/phone/process-speech', methods=['POST'])
def process_speech():
    """Process speech input from caller"""
    try:
        speech_result = request.form.get('SpeechResult', '').strip()
        call_sid = request.form.get('CallSid', 'unknown')
        caller_phone = request.form.get('From', '')
        
        logger.info(f"Speech processed: {speech_result}")
        
        # Log speech to PostgreSQL
        call_data = {
            'CallSid': call_sid,
            'From': caller_phone,
            'SpeechResult': speech_result,
            'CallStatus': 'in-progress'
        }
        send_call_data_to_crm(call_data)
        
        phone_handler = PhoneCallHandler()
        response = phone_handler.process_speech_input(speech_result)
        
        return str(response), 200, {'Content-Type': 'text/xml'}
        
    except Exception as e:
        logger.error(f"Speech processing error: {e}")
        response = VoiceResponse()
        response.say("I'm sorry, I didn't understand that. Let me transfer you to our team.", voice='Polly.Joanna')
        
        dial = Dial()
        dial.number('+16566001400')
        response.append(dial)
        
        return str(response), 200, {'Content-Type': 'text/xml'}

@app.route('/phone/collect-name', methods=['POST'])
def collect_name():
    """Collect customer name during booking"""
    try:
        speech_result = request.form.get('SpeechResult', '').strip()
        call_sid = request.form.get('CallSid', 'unknown')
        
        if speech_result and len(speech_result) >= 2:
            session[f'call_{call_sid}_name'] = speech_result
            
            phone_handler = PhoneCallHandler()
            response = phone_handler.collect_booking_info('name', speech_result)
            
            return str(response), 200, {'Content-Type': 'text/xml'}
        else:
            response = VoiceResponse()
            
            gather = Gather(
                input='speech',
                timeout=5,
                action='/phone/collect-name',
                method='POST'
            )
            gather.say("I didn't catch that. Please say your full name clearly.", voice='Polly.Joanna')
            response.append(gather)
            
            return str(response), 200, {'Content-Type': 'text/xml'}
            
    except Exception as e:
        logger.error(f"Name collection error: {e}")
        response = VoiceResponse()
        response.say("There was an error. Let me connect you with our team.", voice='Polly.Joanna')
        
        dial = Dial()
        dial.number('+16566001400')
        response.append(dial)
        
        return str(response), 200, {'Content-Type': 'text/xml'}

@app.route('/phone/collect-phone', methods=['POST'])
def collect_phone():
    """Collect customer phone number during booking"""
    try:
        speech_result = request.form.get('SpeechResult', '').strip()
        digits = request.form.get('Digits', '').strip()
        call_sid = request.form.get('CallSid', 'unknown')
        
        # Use digits if available, otherwise use speech
        phone_input = digits if digits else speech_result
        
        if phone_input:
            # Clean phone number
            phone_digits = re.sub(r'\D', '', phone_input)
            
            if len(phone_digits) >= 10:
                formatted_phone = f"+1{phone_digits[-10:]}"
                
                customer_name = session.get(f'call_{call_sid}_name', 'Customer')
                
                phone_handler = PhoneCallHandler()
                response = phone_handler.collect_booking_info('phone', formatted_phone)
                
                return str(response), 200, {'Content-Type': 'text/xml'}
        
        # If we get here, the phone number wasn't valid
        response = VoiceResponse()
        
        gather = Gather(
            input='speech dtmf',
            timeout=10,
            action='/phone/collect-phone',
            method='POST',
            numDigits=10,
            finishOnKey='#'
        )
        gather.say("I need a valid phone number. Please say it clearly or enter it using the keypad.", voice='Polly.Joanna')
        response.append(gather)
        
        return str(response), 200, {'Content-Type': 'text/xml'}
        
    except Exception as e:
        logger.error(f"Phone collection error: {e}")
        response = VoiceResponse()
        response.say("There was an error collecting your phone number. Let me connect you with our team.", voice='Polly.Joanna')
        
        dial = Dial()
        dial.number('+16566001400')
        response.append(dial)
        
        return str(response), 200, {'Content-Type': 'text/xml'}

@app.route('/phone/pricing-followup', methods=['POST'])
def pricing_followup():
    """Handle followup after pricing information"""
    try:
        speech_result = request.form.get('SpeechResult', '').strip().lower()
        
        phone_handler = PhoneCallHandler()
        
        if any(word in speech_result for word in ['yes', 'book', 'demo', 'consultation', 'schedule']):
            response = phone_handler.handle_demo_booking()
        elif any(word in speech_result for word in ['repeat', 'again', 'pricing', 'prices']):
            response = phone_handler.handle_pricing_inquiry()
        else:
            response = VoiceResponse()
            response.say("Thank you for your interest in RinglyPro. Let me connect you with our team for more information.", voice='Polly.Joanna')
            
            dial = Dial()
            dial.number('+16566001400')
            response.append(dial)
        
        return str(response), 200, {'Content-Type': 'text/xml'}
        
    except Exception as e:
        logger.error(f"Pricing followup error: {e}")
        response = VoiceResponse()
        response.say("Let me connect you with our team.", voice='Polly.Joanna')
        
        dial = Dial()
        dial.number('+16566001400')
        response.append(dial)
        
        return str(response), 200, {'Content-Type': 'text/xml'}

@app.route('/phone/call-complete', methods=['POST'])
def call_complete():
    """Handle call completion"""
    try:
        call_sid = request.form.get('CallSid', 'unknown')
        call_duration = request.form.get('CallDuration', '0')
        call_status = request.form.get('CallStatus', 'completed')
        
        # Log final call data to PostgreSQL
        call_data = {
            'CallSid': call_sid,
            'CallStatus': call_status,
            'CallDuration': call_duration,
            'FinalStatus': 'completed'
        }
        send_call_data_to_crm(call_data)
        
        response = VoiceResponse()
        response.say("Thank you for calling RinglyPro. Have a great day!", voice='Polly.Joanna')
        
        return str(response), 200, {'Content-Type': 'text/xml'}
        
    except Exception as e:
        logger.error(f"Call completion error: {e}")
        response = VoiceResponse()
        response.say("Thank you for calling.", voice='Polly.Joanna')
        return str(response), 200, {'Content-Type': 'text/xml'}

# ==================== AUDIO SERVING ROUTES ====================

@app.route('/audio/<filename>')
def serve_audio(filename):
    """Serve audio files for Rachel's voice"""
    try:
        audio_path = f"/tmp/{filename}"
        
        if os.path.exists(audio_path):
            def generate():
                with open(audio_path, 'rb') as f:
                    data = f.read(1024)
                    while data:
                        yield data
                        data = f.read(1024)
                
                # Clean up file after serving
                try:
                    os.remove(audio_path)
                except:
                    pass
            
            response = make_response(generate())
            response.headers['Content-Type'] = 'audio/mpeg'
            response.headers['Cache-Control'] = 'no-cache'
            return response
        else:
            logger.warning(f"Audio file not found: {filename}")
            return "Audio file not found", 404
            
    except Exception as e:
        logger.error(f"Error serving audio {filename}: {e}")
        return "Error serving audio", 500

# ==================== HEALTH CHECK & ADMIN ROUTES ====================

@app.route('/health')
def health_check():
    """Health check endpoint"""
    try:
        # Test PostgreSQL connection via CRM API
        crm_test = crm_client._make_request('GET', '/health')
        postgresql_status = bool(crm_test and crm_test.get('success'))
        
        status = {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "services": {
                "postgresql_crm_api": postgresql_status,
                "elevenlabs_api": bool(elevenlabs_api_key),
                "anthropic_api": bool(anthropic_api_key),
                "twilio_api": bool(twilio_account_sid and twilio_auth_token),
                "email_smtp": bool(email_user and email_password),
                "hubspot_api": bool(hubspot_api_token)
            }
        }
        
        all_healthy = all(status["services"].values())
        
        if not all_healthy:
            status["status"] = "degraded"
        
        return jsonify(status), 200 if all_healthy else 206
        
    except Exception as e:
        logger.error(f"Health check error: {e}")
        return jsonify({
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }), 500

@app.route('/admin/stats')
def admin_stats():
    """Admin statistics - PostgreSQL backend"""
    try:
        # Get stats from PostgreSQL via CRM API
        stats_result = crm_client._make_request('GET', '/admin/stats')
        
        if stats_result and stats_result.get('success'):
            stats = stats_result.get('stats', {})
        else:
            stats = {
                "error": "Failed to fetch stats from PostgreSQL",
                "fallback_mode": True
            }
        
        # Add runtime information
        stats.update({
            "app_start_time": datetime.now().isoformat(),
            "database_type": "PostgreSQL via CRM API",
            "integrations": {
                "hubspot": bool(hubspot_api_token),
                "elevenlabs": bool(elevenlabs_api_key),
                "twilio": bool(twilio_account_sid),
                "email": bool(email_user)
            }
        })
        
        return jsonify(stats)
        
    except Exception as e:
        logger.error(f"Stats error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/admin/appointments')
def admin_appointments():
    """Admin view of appointments - PostgreSQL backend"""
    try:
        # Get appointments from PostgreSQL via CRM API
        appointments_result = crm_client._make_request('GET', '/appointments')
        
        if appointments_result and appointments_result.get('success'):
            appointments = appointments_result.get('appointments', [])
            
            html = """
            <!DOCTYPE html>
            <html>
            <head>
                <title>RinglyPro Appointments - PostgreSQL Backend</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    table { border-collapse: collapse; width: 100%; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                    .status-confirmed { color: green; font-weight: bold; }
                    .status-pending { color: orange; font-weight: bold; }
                    .status-cancelled { color: red; font-weight: bold; }
                </style>
            </head>
            <body>
                <h1>RinglyPro Appointments (PostgreSQL Backend)</h1>
                <p>Total appointments: {count}</p>
                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Time</th>
                            <th>Customer</th>
                            <th>Email</th>
                            <th>Phone</th>
                            <th>Purpose</th>
                            <th>Confirmation Code</th>
                            <th>Created</th>
                        </tr>
                    </thead>
                    <tbody>
            """.format(count=len(appointments))
            
            for appointment in appointments:
                created_date = appointment.get('createdAt', 'Unknown')
                if created_date and created_date != 'Unknown':
                    try:
                        created_dt = datetime.fromisoformat(created_date.replace('Z', '+00:00'))
                        created_date = created_dt.strftime('%m/%d/%Y %I:%M %p')
                    except:
                        pass
                
                html += f"""
                        <tr>
                            <td>{appointment.get('appointmentDate', 'N/A')}</td>
                            <td>{appointment.get('appointmentTime', 'N/A')}</td>
                            <td>{appointment.get('customerName', 'N/A')}</td>
                            <td>{appointment.get('customerEmail', 'N/A')}</td>
                            <td>{appointment.get('customerPhone', 'N/A')}</td>
                            <td>{appointment.get('purpose', 'N/A')}</td>
                            <td><code>{appointment.get('confirmationCode', 'N/A')}</code></td>
                            <td>{created_date}</td>
                        </tr>
                """
            
            html += """
                    </tbody>
                </table>
                <br>
                <p><strong>Database:</strong> PostgreSQL via CRM API</p>
                <p><strong>Last Updated:</strong> {timestamp}</p>
            </body>
            </html>
            """.format(timestamp=datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
            
            return html
        else:
            return f"""
            <html>
            <body>
                <h1>PostgreSQL Connection Error</h1>
                <p>Unable to fetch appointments from PostgreSQL database via CRM API.</p>
                <p>Error: {appointments_result.get('error', 'Unknown error')}</p>
            </body>
            </html>
            """, 500
            
    except Exception as e:
        logger.error(f"Admin appointments error: {e}")
        return f"""
        <html>
        <body>
            <h1>Error</h1>
            <p>Failed to load appointments: {str(e)}</p>
        </body>
        </html>
        """, 500

# ==================== ERROR HANDLERS ====================

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({"error": "Endpoint not found"}), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    logger.error(f"Internal server error: {error}")
    return jsonify({"error": "Internal server error"}), 500

@app.errorhandler(Exception)
def handle_exception(e):
    """Handle all other exceptions"""
    logger.error(f"Unhandled exception: {e}")
    import traceback
    logger.error(traceback.format_exc())
    return jsonify({"error": "An unexpected error occurred"}), 500

# ==================== APPLICATION STARTUP ====================

def is_render_environment():
    """Check if running on Render"""
    return os.getenv('RENDER') == 'true'

def initialize_application():
    """Initialize the application and all services"""
    try:
        logger.info("🚀 Starting RinglyPro Voice Assistant with PostgreSQL Backend")
        logger.info("=" * 80)
        
        # Test PostgreSQL connection via CRM API
        logger.info("🗄️ Testing PostgreSQL connection via CRM API...")
        crm_connected = init_crm_connection()
        
        if crm_connected:
            logger.info("✅ PostgreSQL connection successful via CRM API")
        else:
            logger.warning("⚠️ PostgreSQL connection failed - app will run with limited functionality")
        
        # Test integrations
        logger.info("🔧 Testing integrations...")
        
        if hubspot_api_token:
            logger.info("✅ HubSpot API configured")
        else:
            logger.warning("⚠️ HubSpot API not configured")
        
        if elevenlabs_api_key:
            logger.info("✅ ElevenLabs API configured (Rachel's voice available)")
        else:
            logger.warning("⚠️ ElevenLabs API not configured (fallback to browser TTS)")
        
        if twilio_account_sid and twilio_auth_token:
            logger.info("✅ Twilio API configured")
        else:
            logger.warning("⚠️ Twilio API not configured")
        
        if email_user and email_password:
            logger.info("✅ Email SMTP configured")
        else:
            logger.warning("⚠️ Email SMTP not configured")
        
        logger.info("=" * 80)
        logger.info("🎤 RinglyPro Voice Assistant Ready!")
        logger.info("📊 Database: PostgreSQL via CRM API")
        logger.info("🔗 Health Check: /health")
        logger.info("📋 Admin Panel: /admin/appointments")
        logger.info("🧪 Test System: /test-appointment-system")
        logger.info("=" * 80)
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Application initialization failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return False

# ==================== MAIN APPLICATION STARTUP ====================

if __name__ == "__main__":
    print("🚀 Starting RinglyPro AI Assistant v3.0 - PostgreSQL Edition")
    print("\n" + "="*70)
    print("📋 API STATUS:")
    print(f"   • Claude API: {'✅ Ready' if anthropic_api_key else '❌ Missing'}")
    print(f"   • ElevenLabs TTS: {'✅ Ready' if elevenlabs_api_key else '⚠️ Browser Fallback'}")
    print(f"   • Twilio SMS: {'✅ Ready' if (twilio_account_sid and twilio_auth_token) else '⚠️ Disabled'}")
    print(f"   • Email SMTP: {'✅ Ready' if (email_user and email_password) else '⚠️ Disabled'}")
    print(f"   • HubSpot CRM: {'✅ Ready' if hubspot_api_token else '⚠️ Disabled'}")
    
    print("\n🗄️ DATABASE STATUS:")
    # Test PostgreSQL connection via CRM API
    crm_connected = init_crm_connection()
    print(f"   • PostgreSQL (CRM API): {'✅ Connected' if crm_connected else '❌ Connection Failed'}")
    print(f"   • CRM API Endpoint: {CRM_BASE_URL}")
    
    print("\n🌐 ACCESS URLS:")
    print("   • Voice Interface: http://localhost:5000")
    print("   • Text Chat: http://localhost:5000/chat")
    print("   • Enhanced Chat: http://localhost:5000/chat-enhanced")
    print("   • Admin Appointments: http://localhost:5000/admin/appointments")
    print("   • System Test: http://localhost:5000/test-appointment-system")
    print("   • Health Check: http://localhost:5000/health")
    print("\n" + "="*70)
    
    # Start the application
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=False, host='0.0.0.0', port=port)