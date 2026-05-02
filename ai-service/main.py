# ============================================================
# FILE: ai-service/main.py
# FASTAPI CHATBOT SERVER
# ============================================================
# JAIS LLM (Arabic) + OpenAI (English) + LangChain RAG
# POST /chat → streaming response
# ============================================================

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
import os
import json
import base64
import re
import io
import shutil
from dotenv import load_dotenv
from langdetect import detect, LangDetectException
from openai import OpenAI
import httpx
import pytesseract
from PIL import Image

load_dotenv()

app = FastAPI(title="City Terminal AI Chatbot")

# ── CORS — Mobile app se request allow karo ──────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── MODEL CONFIG ──────────────────────────────────────────
DEFAULT_MODEL_PROVIDER = os.getenv("MODEL_PROVIDER", "auto").lower()
DEFAULT_JAIS_MODEL = os.getenv("JAIS_MODEL", "inceptionai/jais-13b-chat")
DEFAULT_OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY") or "EMPTY")
default_tesseract_path = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
tesseract_cmd = (
    os.getenv("TESSERACT_CMD")
    or (default_tesseract_path if os.path.exists(default_tesseract_path) else None)
    or shutil.which("tesseract")
)
if tesseract_cmd:
    pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

jais_client = OpenAI(
    api_key=os.getenv("JAIS_API_KEY", ""),
    base_url=os.getenv("JAIS_API_BASE", "https://api.together.xyz/v1"),
)


class SupabaseGateway:
    def __init__(self) -> None:
        self.url = os.getenv("SUPABASE_URL", "").rstrip("/")
        self.key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "") or os.getenv("SUPABASE_ANON_KEY", "")

    @property
    def is_configured(self) -> bool:
        return bool(self.url and self.key)

    def _headers(self) -> Dict[str, str]:
        return {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }

    async def fetch_one(self, table: str, filters: Dict[str, str], order: Optional[str] = None) -> Dict[str, Any]:
        if not self.is_configured:
            return {}
        params: Dict[str, str] = {"select": "*", "limit": "1"}
        for k, v in filters.items():
            params[k] = f"eq.{v}"
        if order:
            params["order"] = order
        endpoint = f"{self.url}/rest/v1/{table}"
        async with httpx.AsyncClient(timeout=12) as client:
            res = await client.get(endpoint, headers=self._headers(), params=params)
        if res.status_code >= 400:
            return {}
        payload = res.json()
        return payload[0] if payload else {}

    async def fetch_many(self, table: str, params: Dict[str, str]) -> List[Dict[str, Any]]:
        if not self.is_configured:
            return []
        endpoint = f"{self.url}/rest/v1/{table}"
        qp = {"select": "*", **params}
        async with httpx.AsyncClient(timeout=12) as client:
            res = await client.get(endpoint, headers=self._headers(), params=qp)
        if res.status_code >= 400:
            return []
        return res.json()


supabase = SupabaseGateway()

# ── SYSTEM PROMPTS ────────────────────────────────────────
SYSTEM_PROMPT_EN = """You are a helpful bilingual AI assistant for City Terminal Dubai.
City Terminal is a smart airport check-in service by Dubai Future Foundation.
You are powered by JAIS LLM — UAE's official 13B bilingual AI model.

You help passengers with:
- Check-in process and required documents
- Slot booking and pickup locations
- Boarding QR, vehicle assignment, destination, and departure time
- Vehicle tracking information
- Flight information
- General City Terminal queries

Rules:
- Be concise, warm, and professional
- Keep answers under 3-4 sentences
- If you don't know something, say so honestly
- Always respond in English when user writes in English"""

SYSTEM_PROMPT_AR = """أنت مساعد ذكاء اصطناعي لخدمة سيتي تيرمينال دبي.
سيتي تيرمينال خدمة ذكية لتسجيل الوصول في المطار من مؤسسة دبي للمستقبل.
أنت مدعوم بنموذج JAIS — نموذج الذكاء الاصطناعي الرسمي لدولة الإمارات.

تساعد المسافرين في:
- عملية تسجيل الوصول والوثائق المطلوبة
- حجز الفترات الزمنية ومواقع الاستلام
- رمز QR، المركبة المخصصة، الوجهة، ووقت المغادرة
- معلومات تتبع المركبات
- معلومات الرحلات
- استفسارات سيتي تيرمينال العامة

القواعد:
- كن موجزاً ودافئاً ومحترفاً
- اجعل إجاباتك قصيرة - 3-4 جمل كحد أقصى
- إذا كنت لا تعرف شيئاً، قل ذلك بصدق
- استجب دائماً بالعربية عندما يكتب المستخدم بالعربية
- استخدم البيانات المباشرة عند توفرها للحجز، رمز QR، المركبة، الوجهة، المغادرة، وحالة الرحلة"""

# ── REQUEST MODEL ─────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str
    bookingId: Optional[str] = None
    history: Optional[list] = []


class PassportVerifyRequest(BaseModel):
    imageBase64: str = Field(..., description="Raw base64 image or data-url base64")
    bookingId: Optional[str] = None


class LiveStatusRequest(BaseModel):
    bookingId: str

# ── LANGUAGE DETECT ───────────────────────────────────────
def detect_language(text: str) -> str:
    if re.search(r"[\u0600-\u06FF]", text or ""):
        return "ar"
    try:
        lang = detect(text)
        return 'ar' if lang == 'ar' else 'en'
    except LangDetectException:
        return 'en'

# ── RAG SEARCH ────────────────────────────────────────────
def normalize_b64_image(image_base64: str) -> str:
    if "," in image_base64 and image_base64.startswith("data:"):
        return image_base64.split(",", 1)[1]
    return image_base64


def detect_intents(user_text: str) -> List[str]:
    text = user_text.lower()
    intents: List[str] = []

    if any(k in text for k in ["vehicle", "car", "driver", "location", "where is", "مركبة", "سيارة", "وين", "أين"]):
        intents.append("vehicle_status")
    if any(k in text for k in ["bag", "baggage", "luggage", "حقائب", "شنط"]):
        intents.append("baggage_status")
    if any(k in text for k in ["flight", "on time", "delay", "late", "رحلة", "متأخر", "موعد"]):
        intents.append("flight_status")
    if any(k in text for k in ["slot", "book", "available", "time slot", "حجز", "مواعيد", "فتحات"]):
        intents.append("slot_availability")
    return intents


async def get_live_booking_context(booking_id: Optional[str], intents: List[str]) -> Dict[str, Any]:
    if not booking_id:
        return {"booking": None, "vehicle": None, "baggage": None, "flight": None, "slots": []}

    booking = await supabase.fetch_one("bookings", {"booking_id": booking_id})
    result: Dict[str, Any] = {"booking": booking, "vehicle": None, "baggage": None, "flight": None, "slots": []}

    if "vehicle_status" in intents:
        result["vehicle"] = await supabase.fetch_one(
            "vehicle_tracking",
            {"booking_id": booking_id},
            order="updated_at.desc",
        )
    if "baggage_status" in intents:
        result["baggage"] = await supabase.fetch_one(
            "baggage_events",
            {"booking_id": booking_id},
            order="event_time.desc",
        )
    if "flight_status" in intents:
        flight_no = booking.get("flight_number") if booking else None
        if flight_no:
            result["flight"] = await supabase.fetch_one(
                "flight_status",
                {"flight_number": str(flight_no)},
                order="updated_at.desc",
            )
    if "slot_availability" in intents:
        slots = await supabase.fetch_many(
            "slots",
            {
                "is_available": "eq.true",
                "order": "slot_time.asc",
                "limit": "5",
            },
        )
        result["slots"] = slots
    return result


def build_live_context_text(live: Dict[str, Any], lang: str) -> str:
    if not any([live.get("booking"), live.get("vehicle"), live.get("baggage"), live.get("flight"), live.get("slots")]):
        return "No live operational records found."

    as_json = json.dumps(live, ensure_ascii=False)
    if lang == "ar":
        return (
            "هذه بيانات تشغيل حية من قاعدة البيانات. استخدمها كمصدر الحقيقة. "
            "إذا كانت قيمة مفقودة قل ذلك بصراحة ولا تخترع معلومات.\n"
            f"{as_json}"
        )
    return (
        "This is live operational data from database tables. Treat it as source-of-truth. "
        "If any field is missing, say that clearly and do not fabricate.\n"
        f"{as_json}"
    )


def local_city_terminal_answer(message: str, booking_id: Optional[str], live: Dict[str, Any], lang: str) -> str:
    booking = live.get("booking") or {}
    vehicle = live.get("vehicle") or {}
    slots = live.get("slots") or []
    text = (message or "").lower()

    if lang == "ar":
        if vehicle:
            return (
                f"حالة الحجز {booking_id}: المركبة {vehicle.get('vehicle_number') or 'غير محددة'} "
                f"وحالتها {vehicle.get('status') or 'غير متاحة'}. "
                f"الموقع الحالي: {vehicle.get('current_location') or 'غير متاح'}."
            )
        if booking:
            return (
                f"تفاصيل الحجز {booking_id}: الرحلة {booking.get('flight_number') or 'غير متاحة'}، "
                f"الوجهة {booking.get('destination') or 'غير متاحة'}، "
                f"ووقت المغادرة {booking.get('departure_time') or 'غير متاح'}."
            )
        if slots:
            first = slots[0]
            return f"أقرب موعد متاح هو {first.get('slot_time')} في {first.get('location_name') or 'موقع الاستلام'}."
        return "أستطيع مساعدتك في الحجز، رمز QR، حالة المركبة، الرحلة، ومواقع الاستلام. أرسل رقم الحجز للحصول على بيانات مباشرة."

    if vehicle and any(k in text for k in ["vehicle", "car", "driver", "where", "location", "status"]):
        return (
            f"Booking {booking_id}: vehicle {vehicle.get('vehicle_number') or 'not assigned'} is "
            f"{vehicle.get('status') or 'unknown'}. Current location: {vehicle.get('current_location') or 'not available'}."
        )
    if booking:
        return (
            f"Booking {booking_id}: flight {booking.get('flight_number') or 'unknown'}, "
            f"destination {booking.get('destination') or 'unknown'}, departure {booking.get('departure_time') or 'unknown'}. "
            f"Ask me about your QR, vehicle, slot, or flight status."
        )
    if slots:
        first = slots[0]
        return f"The next available slot is {first.get('slot_time')} at {first.get('location_name') or 'the pickup point'}."
    return "I can help with booking QR, vehicle status, flight details, pickup location, and slots. Share a booking ID for live details."


def has_model_credentials() -> bool:
    return bool(os.getenv("OPENAI_API_KEY") or os.getenv("JAIS_API_KEY"))


def model_config_for_lang(lang: str) -> Dict[str, Any]:
    provider = DEFAULT_MODEL_PROVIDER
    if provider == "jais" and os.getenv("JAIS_API_KEY"):
        return {"provider": "jais", "model": DEFAULT_JAIS_MODEL}
    if provider == "openai":
        return {"provider": "openai", "model": DEFAULT_OPENAI_MODEL}

    # auto fallback: prefer JAIS for Arabic if configured
    if lang == "ar" and os.getenv("JAIS_API_KEY"):
        return {"provider": "jais", "model": DEFAULT_JAIS_MODEL}
    return {"provider": "openai", "model": DEFAULT_OPENAI_MODEL}


def completion_stream(messages: List[Dict[str, str]], lang: str):
    cfg = model_config_for_lang(lang)
    if cfg["provider"] == "jais":
        return jais_client.chat.completions.create(
            model=cfg["model"],
            messages=messages,
            max_tokens=500,
            temperature=0.5,
            stream=True,
        )
    return openai_client.chat.completions.create(
        model=cfg["model"],
        messages=messages,
        max_tokens=500,
        temperature=0.5,
        stream=True,
    )


async def run_passport_ocr_openai(image_base64: str) -> Dict[str, Any]:
    prompt = (
        "Extract passport fields from this image. Return strict JSON only with keys: "
        "name, passportNumber, dateOfBirth, nationality, expiryDate, confidence (0-1). "
        "If not visible set null."
    )
    b64 = normalize_b64_image(image_base64)
    # Basic sanity validation before calling model
    base64.b64decode(b64[:2000] + "==", validate=False)

    response = openai_client.chat.completions.create(
        model=os.getenv("PASSPORT_VISION_MODEL", "gpt-4o"),
        temperature=0,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
                    },
                ],
            }
        ],
    )
    raw = response.choices[0].message.content or "{}"
    matched = re.search(r"\{.*\}", raw, re.DOTALL)
    return json.loads(matched.group(0) if matched else "{}")


async def run_passport_ocr_tesseract(image_base64: str) -> Dict[str, Any]:
    b64 = normalize_b64_image(image_base64)
    image_bytes = base64.b64decode(b64, validate=False)
    image = Image.open(io.BytesIO(image_bytes))
    raw_text = pytesseract.image_to_string(image)

    passport_match = re.search(r"[A-Z][0-9]{7,8}", (raw_text or "").upper())
    passport_number = passport_match.group(0) if passport_match else None

    return {
        "passportNumber": passport_number,
        "confidence": 1.0 if passport_number else 0.0,
        "rawText": raw_text,
    }

# ── MAIN CHAT ENDPOINT ────────────────────────────────────
@app.post("/chat")
async def chat(req: ChatRequest):

    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message is required")

    # Language detect karo
    lang = detect_language(req.message)
    print(f"Language detected: {lang} | Message: {req.message[:50]}")

    intents = detect_intents(req.message)
    live_context = await get_live_booking_context(req.bookingId, intents)
    context = build_live_context_text(live_context, lang)

    # System prompt choose karo
    system_prompt = SYSTEM_PROMPT_AR if lang == 'ar' else SYSTEM_PROMPT_EN

    # Context add karo system prompt mein
    system_prompt += f"\n\nLive context:\n{context}"

    # Booking context add karo
    if req.bookingId:
        system_prompt += f"\n\nUser's booking ID: {req.bookingId}"

    # Messages build karo
    messages = [{"role": "system", "content": system_prompt}]

    # History add karo (last 6 messages)
    if req.history:
        for msg in req.history[-6:]:
            messages.append({
                "role": msg.get("role", "user"),
                "content": msg.get("content", "")
            })

    # Current message
    messages.append({"role": "user", "content": req.message})

    # ── STREAMING RESPONSE ────────────────────────────────
    async def generate():
        try:
            if not has_model_credentials():
                fallback = local_city_terminal_answer(req.message, req.bookingId, live_context, lang)
                yield f"data: {json.dumps({'type': 'lang', 'lang': lang})}\n\n"
                yield f"data: {json.dumps({'type': 'text', 'content': fallback}, ensure_ascii=False)}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                return

            stream = completion_stream(messages, lang)

            # Language info pehle bhejo
            yield f"data: {json.dumps({'type': 'lang', 'lang': lang})}\n\n"

            # Text stream karo
            for chunk in stream:
                if chunk.choices[0].delta.content:
                    text = chunk.choices[0].delta.content
                    yield f"data: {json.dumps({'type': 'text', 'content': text})}\n\n"

            # Done signal
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as e:
            print(f"Stream error: {e}")
            error_msg = "عذراً، حدث خطأ. حاول مرة أخرى." if lang == 'ar' else "Sorry, an error occurred. Please try again."
            yield f"data: {json.dumps({'type': 'error', 'content': error_msg})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )

# ── HEALTH CHECK ──────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "message": "City Terminal AI Chatbot running!",
        "model_provider": DEFAULT_MODEL_PROVIDER,
        "jais_model": DEFAULT_JAIS_MODEL,
        "openai_model": DEFAULT_OPENAI_MODEL,
        "supabase_connected": supabase.is_configured,
    }


@app.post("/chat/live-status")
async def chat_live_status(req: LiveStatusRequest):
    live = await get_live_booking_context(
        req.bookingId,
        ["vehicle_status", "baggage_status", "flight_status", "slot_availability"],
    )
    if not live.get("booking"):
        raise HTTPException(status_code=404, detail="Booking not found")
    return {"success": True, "bookingId": req.bookingId, "live": live}


@app.post("/passport/verify-real")
async def verify_passport_real(req: PassportVerifyRequest):
    if not req.imageBase64:
        raise HTTPException(status_code=400, detail="imageBase64 is required")

    try:
        extracted = await run_passport_ocr_tesseract(req.imageBase64)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"OCR failed: {str(exc)}") from exc

    confidence = extracted.get("confidence", 0) or 0
    is_verified = confidence >= float(os.getenv("PASSPORT_MIN_CONFIDENCE", "0.75"))
    return {
        "success": True,
        "verified": bool(is_verified),
        "provider": "tesseract",
        "bookingId": req.bookingId,
        "data": extracted,
    }

# ── RUN ───────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
