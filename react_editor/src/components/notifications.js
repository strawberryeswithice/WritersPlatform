let _dispatch = null;

export function registerDispatch(fn) {
  _dispatch = fn;
}

function show(message, title, type = 'info', duration = 3500) {
  if (_dispatch) {
    _dispatch({ message, title, type, duration, id: Date.now() + Math.random() });
  }
}

export const notifications = {
  success: (msg, title, dur) => show(msg, title, 'success', dur),
  error:   (msg, title, dur) => show(msg, title, 'error',   dur),
  warning: (msg, title, dur) => show(msg, title, 'warning', dur),
  info:    (msg, title, dur) => show(msg, title, 'info',    dur),

  sticky: (msg, title, type = 'info') => {
    const id = Date.now() + Math.random();
    if (_dispatch) _dispatch({ message: msg, title, type, duration: 0, sticky: true, id });
    return id;
  },

  dismiss: (id) => {
    if (_dispatch) _dispatch({ __dismiss: id });
  },
};