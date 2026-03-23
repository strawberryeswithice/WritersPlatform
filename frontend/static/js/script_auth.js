let _pendingRegisterData = null;
let _resetEmail = null;
let _resetCodeVerified = false;

const slider = document.getElementById('tabSlider');

function _hideAllForms() {
    document.querySelectorAll('.form').forEach(f => f.classList.remove('active'));
}

function _showForm(id) {
    _hideAllForms();
    document.getElementById(id).classList.add('active');
}

function _setTabSlider(side) {
    slider.style.left = side === 'right' ? '50%' : '0%';
    document.getElementById('loginTab').classList.toggle('active', side === 'left');
    document.getElementById('registerTab').classList.toggle('active', side === 'right');
}

function showLogin() {
    _setTabSlider('left');
    _showForm('loginForm');
}

function showRegister() {
    _setTabSlider('right');
    _showForm('registerForm');
}

function showForgotPassword() {
    slider.style.left = '0%';
    document.getElementById('loginTab').classList.remove('active');
    document.getElementById('registerTab').classList.remove('active');
    _showForm('forgotForm');
}

document.getElementById('loginTab').onclick = showLogin;
document.getElementById('registerTab').onclick = showRegister;

async function handleSendRegisterCode(resend = false) {
    let email, password, passwordConfirm, fullName;

    if (resend && _pendingRegisterData) {
        ({ email, password, passwordConfirm, fullName } = _pendingRegisterData);
    } else {
        email        = document.getElementById('registerEmail').value.trim();
        fullName     = document.getElementById('registerFullName').value.trim();
        password     = document.getElementById('registerPassword').value;
        passwordConfirm = document.getElementById('registerPasswordConfirm').value;

        if (!email || !password || !passwordConfirm) {
            notifications.warning('Пожалуйста, заполните все обязательные поля', 'Внимание');
            return;
        }
        if (password !== passwordConfirm) {
            notifications.error('Пароли не совпадают', 'Ошибка');
            return;
        }
        if (password.length < 8) {
            notifications.warning('Пароль должен содержать минимум 8 символов', 'Внимание');
            return;
        }

        _pendingRegisterData = { email, password, passwordConfirm, fullName };
    }

    try {
        const res = await fetch('/api/auth/send-register-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        const data = await res.json();

        if (res.ok) {
            document.getElementById('registerEmailDisplay').textContent = email;
            document.getElementById('registerCode').value = '';
            _setTabSlider('right');
            _showForm('registerCodeForm');
            notifications.success('Код отправлен на вашу почту', 'Проверьте почту', 4000);
        } else {
            notifications.error(data.detail || 'Ошибка при отправке кода', 'Ошибка', 4000);
        }
    } catch {
        notifications.error('Не удалось подключиться к серверу', 'Ошибка соединения');
    }
}

async function handleRegister() {
    if (!_pendingRegisterData) {
        showRegister();
        return;
    }

    const code = document.getElementById('registerCode').value.trim();
    if (!code || code.length !== 6) {
        notifications.warning('Введите 6-значный код из письма', 'Внимание');
        return;
    }

    const { email, password, passwordConfirm, fullName } = _pendingRegisterData;

    const payload = {
        email,
        password,
        password_confirm: passwordConfirm,
        verification_code: code,
    };
    if (fullName) payload.full_name = fullName;

    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();

        if (res.ok) {
            _pendingRegisterData = null;
            notifications.success(
                'Аккаунт успешно создан! Теперь вы можете войти.',
                'Регистрация завершена',
                5000
            );
            showLogin();
            ['registerEmail', 'registerFullName', 'registerPassword', 'registerPasswordConfirm']
                .forEach(id => { document.getElementById(id).value = ''; });
        } else {
            const msg = Array.isArray(data.detail)
                ? data.detail.map(e => e.msg).join('\n')
                : (data.detail || 'Неизвестная ошибка');
            notifications.error(msg, 'Ошибка', 5000);
        }
    } catch {
        notifications.error('Не удалось подключиться к серверу', 'Ошибка соединения');
    }
}

async function handleLogin() {
    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        notifications.warning('Пожалуйста, введите email и пароль', 'Внимание');
        return;
    }

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('access_token', data.access_token);
            notifications.success('Добро пожаловать!', 'Вход выполнен', 3000);
            setTimeout(() => {
                window.location.href = `http://localhost:8011/catalog?token=${data.access_token}`;
            }, 1000);
        } else {
            const msg = Array.isArray(data.detail)
                ? data.detail.map(e => e.msg).join('\n')
                : (data.detail || 'Неверный email или пароль');
            notifications.error(msg, 'Ошибка входа', 4000);
        }
    } catch {
        notifications.error('Не удалось подключиться к серверу', 'Ошибка соединения');
    }
}

async function handleSendResetCode(resend = false) {
    const email = resend
        ? _resetEmail
        : document.getElementById('forgotEmail').value.trim();

    if (!email) {
        notifications.warning('Введите email', 'Внимание');
        return;
    }

    _resetEmail = email;
    _resetCodeVerified = false;

    try {
        const res = await fetch('/api/auth/send-reset-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        const data = await res.json();

        if (res.ok) {
            document.getElementById('resetEmailDisplay').textContent = email;
            document.getElementById('resetCode').value = '';
            _showForm('resetCodeForm');
            notifications.success(data.message, 'Проверьте почту', 4000);
        } else {
            notifications.error(data.detail || 'Ошибка', 'Ошибка', 4000);
        }
    } catch {
        notifications.error('Не удалось подключиться к серверу', 'Ошибка соединения');
    }
}

async function handleVerifyResetCode() {
    const code = document.getElementById('resetCode').value.trim();
    if (!code || code.length !== 6) {
        notifications.warning('Введите 6-значный код из письма', 'Внимание');
        return;
    }

    try {
        const res = await fetch('/api/auth/verify-reset-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: _resetEmail, code }),
        });
        const data = await res.json();

        if (res.ok) {
            _resetCodeVerified = true;
            document.getElementById('resetEmailDisplay2').textContent = _resetEmail;
            document.getElementById('newPassword').value = '';
            document.getElementById('newPasswordConfirm').value = '';
            _showForm('newPasswordForm');
        } else {
            notifications.error(data.detail || 'Неверный код', 'Ошибка', 4000);
        }
    } catch {
        notifications.error('Не удалось подключиться к серверу', 'Ошибка соединения');
    }
}

async function handleResetPassword() {
    const newPwd     = document.getElementById('newPassword').value;
    const confirmPwd = document.getElementById('newPasswordConfirm').value;
    const code       = document.getElementById('resetCode').value.trim();

    if (!newPwd || !confirmPwd) {
        notifications.warning('Заполните оба поля', 'Внимание');
        return;
    }
    if (newPwd !== confirmPwd) {
        notifications.error('Пароли не совпадают', 'Ошибка');
        return;
    }
    if (newPwd.length < 8) {
        notifications.warning('Пароль должен содержать минимум 8 символов', 'Внимание');
        return;
    }

    try {
        const res = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: _resetEmail,
                verification_code: code,
                new_password: newPwd,
                new_password_confirm: confirmPwd,
            }),
        });
        const data = await res.json();

        if (res.ok) {
            _resetEmail = null;
            _resetCodeVerified = false;
            notifications.success('Пароль успешно изменён! Теперь войдите.', 'Готово', 5000);
            showLogin();
        } else {
            notifications.error(data.detail || 'Ошибка сброса пароля', 'Ошибка', 4000);
        }
    } catch {
        notifications.error('Не удалось подключиться к серверу', 'Ошибка соединения');
    }
}

showLogin();