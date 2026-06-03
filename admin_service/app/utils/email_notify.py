import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587
SMTP_USER = "littlebulb95@gmail.com"
SMTP_PASSWORD = "ipajqzjgafumyaeh"
SMTP_FROM = "Writers Platform <littlebulb95@gmail.com>"


def _send(to: str, subject: str, html: str) -> None:
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM
        msg["To"] = to
        msg.attach(MIMEText(html, "html", "utf-8"))
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
            s.ehlo(); s.starttls()
            s.login(SMTP_USER, SMTP_PASSWORD)
            s.sendmail(SMTP_USER, to, msg.as_string())
    except Exception as e:
        print(f"[email] Failed to send to {to}: {e}")


def _card(header_color: str, icon: str, title: str, body_html: str) -> str:
    return f"""<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#7fa0bd;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:40px 20px;">
    <table width="400" cellpadding="0" cellspacing="0"
           style="background:#d9e3ec;border-radius:15px;overflow:hidden;
                  box-shadow:0 6px 15px rgba(0,0,0,0.2);">
      <tr>
        <td style="background:{header_color};padding:24px 30px;text-align:center;">
          <div style="font-size:32px;margin-bottom:8px;">{icon}</div>
          <h2 style="margin:0;color:#fff;font-size:19px;">{title}</h2>
        </td>
      </tr>
      <tr><td style="padding:26px 30px;">{body_html}</td></tr>
      <tr>
        <td style="padding:12px 30px;background:#cfd8e2;text-align:center;">
          <p style="margin:0;color:#718096;font-size:11px;">
            Writers Platform · автоматическое уведомление
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>"""


def send_project_deleted(to_email: str, project_title: str, reason: str, admin_email: str) -> None:
    body = f"""
    <p style="color:#4a5568;font-size:14px;line-height:1.6;margin:0 0 16px;">
      Ваш проект <strong>«{project_title}»</strong> был помечен как удалённый администратором.
    </p>
    <div style="background:#f7e8e8;border-left:4px solid #c0392b;border-radius:6px;padding:14px 16px;margin-bottom:16px;">
      <p style="margin:0;font-size:13px;color:#7b1a1a;font-weight:bold;margin-bottom:6px;">Причина:</p>
      <p style="margin:0;font-size:13px;color:#5a2020;line-height:1.5;">{reason}</p>
    </div>
    <p style="color:#718096;font-size:13px;line-height:1.5;">
      Вы можете войти в свой каталог и оспорить решение или удалить проект.
    </p>"""
    _send(to_email, f"Ваш проект «{project_title}» помечен как удалённый",
          _card("#c0392b", "🚫", "Проект помечен как удалённый", body))


def send_project_restored(to_email: str, project_title: str) -> None:
    body = f"""
    <p style="color:#4a5568;font-size:14px;line-height:1.6;margin:0 0 16px;">
      Ваш проект <strong>«{project_title}»</strong> был <strong>восстановлен</strong> администратором.
      Он снова доступен в вашем каталоге.
    </p>"""
    _send(to_email, f"Ваш проект «{project_title}» восстановлен",
          _card("#27ae60", "✅", "Проект восстановлен", body))


def send_appeal_accepted(to_email: str, project_title: str, admin_comment: Optional[str] = None) -> None:
    comment = f"""<div style="background:#eafaf1;border-left:4px solid #27ae60;border-radius:6px;padding:14px 16px;margin-bottom:16px;">
      <p style="margin:0;font-size:13px;color:#1a5c2e;font-weight:bold;margin-bottom:6px;">Комментарий:</p>
      <p style="margin:0;font-size:13px;color:#145a32;">{admin_comment}</p></div>""" if admin_comment else ""
    body = f"""
    <p style="color:#4a5568;font-size:14px;line-height:1.6;margin:0 0 16px;">
      Ваша апелляция по проекту <strong>«{project_title}»</strong> была <strong>принята</strong>.
      Проект восстановлен.
    </p>{comment}"""
    _send(to_email, f"Апелляция по проекту «{project_title}» принята",
          _card("#27ae60", "✅", "Апелляция принята", body))


def send_appeal_rejected(to_email: str, project_title: str, admin_comment: Optional[str] = None) -> None:
    comment = f"""<div style="background:#f7e8e8;border-left:4px solid #c0392b;border-radius:6px;padding:14px 16px;margin-bottom:16px;">
      <p style="margin:0;font-size:13px;color:#7b1a1a;font-weight:bold;margin-bottom:6px;">Комментарий:</p>
      <p style="margin:0;font-size:13px;color:#5a2020;">{admin_comment}</p></div>""" if admin_comment else ""
    body = f"""
    <p style="color:#4a5568;font-size:14px;line-height:1.6;margin:0 0 16px;">
      Ваша апелляция по проекту <strong>«{project_title}»</strong> была <strong>отклонена</strong>.
    </p>{comment}
    <p style="color:#718096;font-size:13px;">Вы можете подать новую апелляцию (максимум 3 на проект).</p>"""
    _send(to_email, f"Апелляция по проекту «{project_title}» отклонена",
          _card("#c0392b", "❌", "Апелляция отклонена", body))


def send_ban_notification(to_email: str, reason: str) -> None:
    body = f"""
    <p style="color:#4a5568;font-size:14px;line-height:1.6;margin:0 0 16px;">
      Ваш аккаунт на платформе <strong>Writers Platform</strong> был заблокирован.
    </p>
    <div style="background:#f7e8e8;border-left:4px solid #c0392b;border-radius:6px;padding:14px 16px;margin-bottom:16px;">
      <p style="margin:0;font-size:13px;color:#7b1a1a;font-weight:bold;margin-bottom:6px;">Причина:</p>
      <p style="margin:0;font-size:13px;color:#5a2020;">{reason}</p>
    </div>"""
    _send(to_email, "Ваш аккаунт заблокирован — Writers Platform",
          _card("#c0392b", "🔒", "Аккаунт заблокирован", body))


def send_unban_notification(to_email: str) -> None:
    body = """
    <p style="color:#4a5568;font-size:14px;line-height:1.6;margin:0;">
      Ваш аккаунт на платформе <strong>Writers Platform</strong> был восстановлен.
      Вы снова можете пользоваться всеми функциями.
    </p>"""
    _send(to_email, "Ваш аккаунт восстановлен — Writers Platform",
          _card("#27ae60", "🔓", "Аккаунт восстановлен", body))
