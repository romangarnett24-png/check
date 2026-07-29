document.querySelectorAll('.check').forEach((button) => {
  button.addEventListener('click', () => {
    const task = button.closest('.task');
    const done = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(done));
    button.textContent = done ? '✓' : '';
    task.classList.toggle('is-done', done);
  });
});

document.querySelector('.quick-add').addEventListener('click', () => {
  const title = window.prompt('Что нужно сделать?');
  if (!title?.trim()) return;
  const item = document.createElement('article');
  item.className = 'task';
  item.innerHTML = `<button class="check" aria-label="Отметить выполненной" aria-pressed="false"></button><div><h3>${title.trim()}</h3><p>Новая задача <span>·</span> Сейчас</p></div><span class="task-time">—</span>`;
  document.querySelector('.task-list').append(item);
  item.querySelector('.check').addEventListener('click', (event) => {
    const done = event.currentTarget.getAttribute('aria-pressed') !== 'true';
    event.currentTarget.setAttribute('aria-pressed', String(done));
    event.currentTarget.textContent = done ? '✓' : '';
    item.classList.toggle('is-done', done);
  });
});
