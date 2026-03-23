class NotificationManager {
    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'notification-container';
        document.body.appendChild(this.container);
    }

    show(message, duration = 3000) {
        const notification = document.createElement('div');
        notification.className = 'notification';

        notification.innerHTML = `
            <div class="notification-text">${message}</div>
            <button class="notification-close">×</button>
        `;

        const closeBtn = notification.querySelector('.notification-close');
        const close = () => {
            if (notification.parentNode) {
                notification.classList.add('fade-out');
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 300);
            }
        };

        closeBtn.onclick = close;
        this.container.appendChild(notification);

        setTimeout(close, duration);

        return notification;
    }

    success(message) {
        return this.show(message, 3000);
    }

    error(message) {
        return this.show(message, 3000);
    }

    warning(message) {
        return this.show(message, 3000);
    }

    info(message) {
        return this.show(message, 3000);
    }
}

const notifications = new NotificationManager();