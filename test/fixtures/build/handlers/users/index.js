// 前置处理 handler
async function withLog(message, next) {
  const result = await next();
  return result;
}

export function declare() {
  return {
    routes: [
      { method: 'GET', path: '/users' },
      { method: 'GET', path: '/users/:id' },
    ],
    handlers: [withLog]
  };
}

export default async function (message) {
  const { method, params } = message;
  if (params && params.id) {
    return JSON.stringify({ id: params.id, name: 'Alice' });
  }
  return JSON.stringify([{ id: 1, name: 'Alice' }]);
}
