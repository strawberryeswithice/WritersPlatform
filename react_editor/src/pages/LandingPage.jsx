import { useState } from 'react';
import { notifications } from '../utils/notifications.js';
import { setToken } from '../utils/api.js';

const MINIO_BG = 'http://localhost:9000/app-backgrounds/bg1.png';
const STARS_URL = 'http://localhost:9000/app-backgrounds/stars2.png';
const TEXT_URL = 'http://localhost:9000/app-backgrounds/text.png';
const AUTH_URL = 'http://localhost:8010/api/auth';
const CATALOG_URL = 'http://localhost:8011/catalog';

function AuthInput({ label, type = 'text', id, placeholder, autoComplete, style }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, color: '#6b7c9e', marginBottom: 5, fontFamily: 'Nunito' }}>{label}</label>
      <input
        type={type} id={id} placeholder={placeholder} autoComplete={autoComplete}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '11px 14px', borderRadius: 10, border: '1.5px solid #d8dff0',
          fontSize: 14, fontFamily: 'Nunito', outline: 'none', background: '#fff',
          color: '#1e2060', transition: 'border-color .2s',
          ...style,
        }}
        onFocus={e => e.target.style.borderColor = '#4547b5'}
        onBlur={e => e.target.style.borderColor = '#d8dff0'}
      />
    </div>
  );
}

function AuthBtn({ onClick, children, secondary }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', padding: '13px', borderRadius: 12,
      background: secondary ? 'transparent' : '#2b2c7f',
      border: secondary ? '1.5px solid #d8dff0' : 'none',
      color: secondary ? '#6b7c9e' : '#fff',
      fontSize: 15, fontWeight: 700, fontFamily: 'Nunito',
      cursor: 'pointer', letterSpacing: .3, marginTop: secondary ? 8 : 0,
      transition: 'opacity .2s',
    }}
      onMouseEnter={e => e.currentTarget.style.opacity = '.82'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
    >{children}</button>
  );
}

function LoginForm({ onShowRegister, onShowForgot }) {
  const handleLogin = async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPass').value;
    if (!email || !pass) { notifications.warning('Заполните все поля', 'Внимание'); return; }
    try {
      const res = await fetch(`${AUTH_URL}/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass }),
      });
      const data = await res.json();
      if (res.ok) {
        setToken(data.access_token);
        let redirectUrl = `${CATALOG_URL}?token=${data.access_token}`;
        try {
          const payload = JSON.parse(atob(data.access_token.split('.')[1]));
          if (payload.role === 'admin' || payload.role === 'superadmin') {
            redirectUrl = 'http://localhost:8010/admin';
          } else if (payload.blocked) {
            notifications.warning('Аккаунт заблокирован. Доступен только просмотр проектов.', 'Ограниченный доступ');
          } else {
            notifications.success('Добро пожаловать!', 'Вход выполнен');
          }
        } catch {
          notifications.success('Добро пожаловать!', 'Вход выполнен');
        }
        setTimeout(() => { window.location.href = redirectUrl; }, 1200);
      } else {
        notifications.error(Array.isArray(data.detail) ? data.detail.map(e => e.msg).join('\n') : (data.detail || 'Ошибка'), 'Ошибка входа');
      }
    } catch { notifications.error('Нет связи с сервером', 'Ошибка'); }
  };
  return (
    <div>
      <AuthInput label="Email" id="loginEmail" type="email" placeholder="example@mail.com" autoComplete="email" />
      <AuthInput label="Пароль" id="loginPass" type="password" placeholder="Введите пароль" autoComplete="current-password" />
      <AuthBtn onClick={handleLogin}>Войти</AuthBtn>
      <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13, color: '#8b9cbd', fontFamily: 'Nunito' }}>
        Нет аккаунта?{' '}
        <span onClick={onShowRegister} style={{ color: '#4547b5', cursor: 'pointer', fontWeight: 600 }}>Зарегистрироваться</span>
      </div>
      <div style={{ textAlign: 'center', marginTop: 6, fontSize: 13 }}>
        <span onClick={onShowForgot} style={{ color: '#8b9cbd', cursor: 'pointer', fontFamily: 'Nunito' }}>Забыли пароль?</span>
      </div>
    </div>
  );
}

function RegisterForm({ onBack }) {
  const [step, setStep] = useState('form');
  const [pending, setPending] = useState(null);

  const handleSendCode = async () => {
    const email = document.getElementById('regEmail').value.trim();
    const name = document.getElementById('regName').value.trim();
    const pass = document.getElementById('regPass').value;
    const conf = document.getElementById('regConf').value;
    if (!email || !pass || !conf) { notifications.warning('Заполните обязательные поля', 'Внимание'); return; }
    if (pass !== conf) { notifications.error('Пароли не совпадают', 'Ошибка'); return; }
    if (pass.length < 8) { notifications.warning('Пароль — минимум 8 символов', 'Внимание'); return; }
    try {
      const res = await fetch(`${AUTH_URL}/send-register-code`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) { setPending({ email, name, pass, conf }); setStep('code'); notifications.success('Код отправлен на почту', 'Проверьте почту'); }
      else notifications.error(data.detail || 'Ошибка', 'Ошибка');
    } catch { notifications.error('Нет связи с сервером', 'Ошибка'); }
  };

  const handleRegister = async () => {
    if (!pending) return;
    const code = document.getElementById('regCode').value.trim();
    if (!code || code.length !== 6) { notifications.warning('Введите 6-значный код', 'Внимание'); return; }
    const payload = { email: pending.email, password: pending.pass, password_confirm: pending.conf, verification_code: code };
    if (pending.name) payload.full_name = pending.name;
    try {
      const res = await fetch(`${AUTH_URL}/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) { notifications.success('Аккаунт создан! Войдите', 'Регистрация завершена', 5000); onBack(); }
      else notifications.error(Array.isArray(data.detail) ? data.detail.map(e => e.msg).join('\n') : (data.detail || 'Ошибка'), 'Ошибка', 5000);
    } catch { notifications.error('Нет связи с сервером', 'Ошибка'); }
  };

  if (step === 'code') return (
    <div>
      <p style={{ fontSize: 13, color: '#6b7c9e', marginBottom: 16, fontFamily: 'Nunito' }}>
        Код отправлен на <strong style={{ color: '#2b2c7f' }}>{pending?.email}</strong>
      </p>
      <AuthInput label="Код из письма" id="regCode" placeholder="6-значный код"
        style={{ letterSpacing: 6, fontSize: 20, textAlign: 'center' }} />
      <AuthBtn onClick={handleRegister}>Завершить регистрацию</AuthBtn>
      <AuthBtn secondary onClick={() => setStep('form')}>Изменить данные</AuthBtn>
      <AuthBtn secondary onClick={() => handleSendCode()}>Отправить код повторно</AuthBtn>
    </div>
  );
  return (
    <div>
      <AuthInput label="Email *" id="regEmail" type="email" placeholder="example@mail.com" autoComplete="email" />
      <AuthInput label="Имя (необязательно)" id="regName" placeholder="Ваше имя" />
      <AuthInput label="Пароль *" id="regPass" type="password" placeholder="Минимум 8 символов" autoComplete="new-password" />
      <AuthInput label="Повторите пароль *" id="regConf" type="password" placeholder="Повторите пароль" autoComplete="new-password" />
      <AuthBtn onClick={handleSendCode}>Получить код на почту</AuthBtn>
      <div style={{ textAlign: 'center', marginTop: 12, fontSize: 13, color: '#8b9cbd', fontFamily: 'Nunito' }}>
        Уже есть аккаунт?{' '}
        <span onClick={onBack} style={{ color: '#4547b5', cursor: 'pointer', fontWeight: 600 }}>Войти</span>
      </div>
    </div>
  );
}

function ForgotForm({ onBack }) {
  const [step, setStep] = useState('email');
  const [resetEmail, setResetEmail] = useState('');
  const [verifiedCode, setVerifiedCode] = useState('');

  const sendCode = async () => {
    const email = document.getElementById('forgotEmail').value.trim();
    if (!email) { notifications.warning('Введите email', 'Внимание'); return; }
    try {
      const res = await fetch(`${AUTH_URL}/send-reset-code`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) { setResetEmail(email); setStep('code'); notifications.success(data.message || 'Код отправлен', 'Проверьте почту'); }
      else notifications.error(data.detail || 'Ошибка', 'Ошибка');
    } catch { notifications.error('Нет связи с сервером', 'Ошибка'); }
  };

  const verifyCode = async () => {
    const code = document.getElementById('resetCode').value.trim();
    if (!code || code.length !== 6) { notifications.warning('Введите 6-значный код', 'Внимание'); return; }
    try {
      const res = await fetch(`${AUTH_URL}/verify-reset-code`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail, code }),
      });
      const data = await res.json();
      if (res.ok) { setVerifiedCode(code); setStep('newpass'); }
      else notifications.error(data.detail || 'Неверный код', 'Ошибка');
    } catch { notifications.error('Нет связи с сервером', 'Ошибка'); }
  };

  const resetPwd = async () => {
    const np = document.getElementById('newPass').value;
    const nc = document.getElementById('newPassConf').value;
    if (!np || !nc) { notifications.warning('Заполните поля', 'Внимание'); return; }
    if (np !== nc) { notifications.error('Пароли не совпадают', 'Ошибка'); return; }
    if (np.length < 8) { notifications.warning('Минимум 8 символов', 'Внимание'); return; }
    try {
      const res = await fetch(`${AUTH_URL}/reset-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail, verification_code: verifiedCode, new_password: np, new_password_confirm: nc }),
      });
      const data = await res.json();
      if (res.ok) { notifications.success('Пароль изменён! Войдите', 'Готово', 5000); onBack(); }
      else notifications.error(data.detail || 'Ошибка', 'Ошибка');
    } catch { notifications.error('Нет связи с сервером', 'Ошибка'); }
  };

  if (step === 'email') return (
    <div>
      <p style={{ fontSize: 13, color: '#6b7c9e', marginBottom: 14, fontFamily: 'Nunito' }}>Отправим код для сброса пароля</p>
      <AuthInput label="Email" id="forgotEmail" type="email" placeholder="example@mail.com" />
      <AuthBtn onClick={sendCode}>Получить код</AuthBtn>
      <AuthBtn secondary onClick={onBack}>← Вернуться ко входу</AuthBtn>
    </div>
  );
  if (step === 'code') return (
    <div>
      <p style={{ fontSize: 13, color: '#6b7c9e', marginBottom: 14, fontFamily: 'Nunito' }}>
        Код отправлен на <strong style={{ color: '#2b2c7f' }}>{resetEmail}</strong>
      </p>
      <AuthInput label="Код из письма" id="resetCode" placeholder="6-значный код"
        style={{ letterSpacing: 6, fontSize: 20, textAlign: 'center' }} />
      <AuthBtn onClick={verifyCode}>Подтвердить</AuthBtn>
      <AuthBtn secondary onClick={() => setStep('email')}>Изменить email</AuthBtn>
    </div>
  );
  return (
    <div>
      <AuthInput label="Новый пароль" id="newPass" type="password" placeholder="Минимум 8 символов" autoComplete="new-password" />
      <AuthInput label="Повторите пароль" id="newPassConf" type="password" placeholder="Повторите пароль" autoComplete="new-password" />
      <AuthBtn onClick={resetPwd}>Сохранить пароль</AuthBtn>
    </div>
  );
}

export default function LandingPage() {
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState('login');
  const [bgError, setBgError] = useState(false);

  const openAuth = () => { setAuthOpen(true); setAuthTab('login'); };

  const bg = bgError
    ? 'linear-gradient(135deg, #e8eaf8 0%, #c5c8e8 30%, #6b6fb5 65%, #3b3d8a 100%)'
    : `url(${MINIO_BG}) center/cover no-repeat`;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Nunito:wght@400;500;600;700&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }

        html, body {
          height: 100%; overflow: hidden;
        }

        .landing-root {
          width: 100vw; height: 100vh;
          background: ${bg};
          display: flex; align-items: stretch;
          overflow: hidden;
          position: relative;
        }

        .left-panel {
          flex: 0 0 50%;
          display: flex; flex-direction: column; justify-content: center;
          padding: 60px 60px 60px 72px;
        }

        .brand-title {
          font-family: 'Playfair Display', serif;
          font-size: clamp(42px, 5vw, 64px);
          font-weight: 900; color: #2b2c7f;
          line-height: 1.05; letter-spacing: -1px;
          margin-bottom: 16px;
        }

        .brand-sub {
          font-family: 'Nunito', sans-serif;
          font-size: clamp(16px, 2vw, 22px);
          color: #3b3d8a; font-weight: 600;
          line-height: 1.5; max-width: 380px;
        }

        .right-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          position: relative;
          overflow: hidden;
          padding: 60px 72px 60px 40px;
        }

        .hero-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          position: relative;
        }

        .hero-text {
          font-family: 'Nunito', sans-serif;
          font-size: clamp(15px, 1.8vw, 20px);
          color: #fff;
          text-align: center;
          width: 100%;
          margin-bottom: 10px;
          line-height: 1.4;
        }

        .stars-wrap {
          position: relative;
          width: 100%;
          display: flex;
          justify-content: center;
          margin-bottom: 20px;
        }

        .stars-img {
          max-width: 350px;
          display: block;
          transform: translate(65px, -55px);
        }

        .text-wrap {
          position: relative;
          width: 100%;
          display: flex;
          justify-content: center;
          margin-top: 10px;
        }

        .text-img {
          max-width: 305px;
          display: block;
          transform: translate(65px, 35px);
        }

        .start-btn {
          display: block;
          background: rgba(255,255,255,0.92);
          border: none;
          border-radius: 16px;
          padding: 18px 80px;
          font-family: 'Nunito', sans-serif;
          font-size: 22px;
          font-weight: 700;
          color: #2b2c7f;
          cursor: pointer;
          box-shadow: 0 8px 32px rgba(43,44,127,0.18);
          letter-spacing: .5px;
          transition: transform .2s, opacity .55s cubic-bezier(.4,0,.2,1);
          margin: 20px 0;
          position: relative;
                    top: -30px;
                    left: 80px;
        }
        .start-btn:hover { transform: scale(1.03); }

        .hero-desc {
          font-family: 'Nunito', sans-serif;
          color: #fff;
          text-align: center;
          width: 100%;
          font-size: clamp(13px, 1.4vw, 16px);
          line-height: 1.6;
          margin-top: 20px;
        }

        .hero-text, .stars-wrap, .text-wrap, .start-btn, .hero-desc {
          transition: opacity .55s cubic-bezier(.4,0,.2,1),
                      transform .55s cubic-bezier(.4,0,.2,1);
        }

        .auth-panel {
          position: absolute;
          top: 0;
          right: 0;
          bottom: 0;
          width: min(460px, 95vw);
          background: rgba(255,255,255,0.97);
          border-radius: 20px 0 0 20px;
          padding: 48px 44px;
          overflow-y: auto;
          transform: translateX(102%);
          transition: transform .55s cubic-bezier(.4,0,.2,1);
          box-shadow: -12px 0 60px rgba(43,44,127,0.22);
          will-change: transform;
        }
        .auth-panel.open { transform: translateX(0); }

        .auth-tabs {
          display: flex;
          background: #f0f2fb;
          border-radius: 12px;
          padding: 4px;
          margin-bottom: 28px;
          position: relative;
        }

        .auth-tab {
          flex: 1;
          padding: 10px;
          border: none;
          background: transparent;
          font-family: 'Nunito', sans-serif;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          border-radius: 9px;
          transition: background .3s cubic-bezier(.4,0,.2,1), color .3s;
          letter-spacing: .5px;
          text-transform: uppercase;
        }
        .auth-tab.active { background: #2b2c7f; color: #fff; }
        .auth-tab:not(.active) { color: #6b7c9e; }

        .fade-out-hero .hero-text,
        .fade-out-hero .stars-wrap,
        .fade-out-hero .text-wrap,
        .fade-out-hero .start-btn,
        .fade-out-hero .hero-desc {
          opacity: 0;
          transform: translateX(24px);
          pointer-events: none;
        }
      `}</style>

      <img src={MINIO_BG} onError={() => setBgError(true)} style={{ display: 'none' }} alt="" />

      <div className="landing-root">
        <div className="left-panel">
          <div className="brand-title">WRITERS<br />PLATFORM –</div>
          <div className="brand-sub">это место, где идеи<br />обретают структуру</div>
        </div>

        <div className={`right-panel ${authOpen ? 'fade-out-hero' : ''}`}>
          <div className="hero-content">

            <div className="stars-wrap">
              <img
                className="stars-img"
                src={STARS_URL}
                onError={e => e.target.style.display = 'none'}
                alt=""
              />
            </div>

            <button className="start-btn" onClick={openAuth}>начать</button>

            <div className="text-wrap">
              <img
                className="text-img"
                src={TEXT_URL}
                onError={e => e.target.style.display = 'none'}
                alt=""
              />
            </div>
          </div>

          <div className={`auth-panel ${authOpen ? 'open' : ''}`} onClick={e => e.stopPropagation()}>
            {authTab !== 'forgot' && (
              <div className="auth-tabs">
                <button className={`auth-tab ${authTab === 'login' ? 'active' : ''}`}
                  onClick={() => setAuthTab('login')}>Вход</button>
                <button className={`auth-tab ${authTab === 'register' ? 'active' : ''}`}
                  onClick={() => setAuthTab('register')}>Регистрация</button>
              </div>
            )}

            {authTab === 'forgot' && (
              <div style={{ marginBottom: 20 }}>
                <span onClick={() => setAuthTab('login')}
                  style={{ color: '#8b9cbd', cursor: 'pointer', fontSize: 13, fontFamily: 'Nunito' }}>
                  ← Вернуться ко входу
                </span>
              </div>
            )}

            {authTab === 'login' && <LoginForm onShowRegister={() => setAuthTab('register')} onShowForgot={() => setAuthTab('forgot')} />}
            {authTab === 'register' && <RegisterForm onBack={() => setAuthTab('login')} />}
            {authTab === 'forgot' && <ForgotForm onBack={() => setAuthTab('login')} />}
          </div>
        </div>
      </div>
    </>
  );
}