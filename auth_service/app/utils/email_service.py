import random
import string
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587
SMTP_USER = "littlebulb95@gmail.com"
SMTP_PASSWORD = "ipajqzjgafumyaeh"
SMTP_FROM_NAME = "Auth Service"
CODE_EXPIRE_MINUTES = 10

_verification_codes: dict = {}

def _generate_code() -> str:
    return "".join(random.choices(string.digits, k=6))

def _store_code(email: str, code: str, code_type: str) -> None:
    _verification_codes[email] = {
        "code": code,
        "expires_at": datetime.utcnow() + timedelta(minutes=CODE_EXPIRE_MINUTES),
        "type": code_type,
    }

def verify_code(email: str, code: str, code_type: str) -> bool:
    record = _verification_codes.get(email)
    if not record:
        return False
    if record["type"] != code_type:
        return False
    if datetime.utcnow() > record["expires_at"]:
        _verification_codes.pop(email, None)
        return False
    if record["code"] != code:
        return False
    _verification_codes.pop(email, None)
    return True

def _send_email(to_email: str, subject: str, html_body: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{SMTP_FROM_NAME} <{SMTP_USER}>"
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_USER, to_email, msg.as_string())

def _code_email_html(code: str, title: str, description: str) -> str:
    return f"""
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#7fa0bd;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="380" cellpadding="0" cellspacing="0"
             style="background:#d9e3ec;border-radius:15px;overflow:hidden;
                    box-shadow:0 6px 15px rgba(0,0,0,0.2);">
        <tr>
          <td style="background:#6d97bd;padding:24px 30px;text-align:center;">
            <h2 style="margin:0;color:#ffffff;font-size:20px;">{title}</h2>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 30px;text-align:center;">
            <p style="margin:0 0 20px;color:#4a5568;font-size:14px;line-height:1.6;">
              {description}
            </p>
            <div style="display:inline-block;background:#6d97bd;color:#ffffff;
                        font-size:32px;font-weight:bold;letter-spacing:10px;
                        padding:14px 28px;border-radius:10px;">
              {code}
            </div>
            <p style="margin:20px 0 0;color:#718096;font-size:12px;">
              Код действителен {CODE_EXPIRE_MINUTES} минут
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 30px;text-align:center;background:#cfd8e2;">
            <p style="margin:0;color:#718096;font-size:11px;">
              Если вы не запрашивали это письмо просто проигнорируйте его.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""

def send_registration_code(email: str) -> str:
    code = _generate_code()
    _store_code(email, code, "register")
    html = _code_email_html(code, "Подтверждение регистрации",
                            "Для завершения регистрации введите код на сайте:")
    _send_email(email, "Код подтверждения регистрации", html)
    return code

def send_password_reset_code(email: str) -> str:
    code = _generate_code()
    _store_code(email, code, "reset")
    html = _code_email_html(code, "Сброс пароля",
                            "Для сброса пароля введите код на сайте:")
    _send_email(email, "Код сброса пароля", html)
    return code