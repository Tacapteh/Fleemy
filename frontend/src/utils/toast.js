export function showToast(message, isError = false) {
  const el = document.createElement('div');
  el.textContent = message;
  el.style.position = 'fixed';
  el.style.bottom = '20px';
  el.style.right = '20px';
  el.style.background = isError ? '#dc3545' : '#16a34a';
  el.style.color = '#fff';
  el.style.padding = '10px 16px';
  el.style.borderRadius = '4px';
  el.style.zIndex = 9999;
  el.style.transition = 'opacity 0.3s';
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.addEventListener('transitionend', () => el.remove());
  }, 3000);
}
