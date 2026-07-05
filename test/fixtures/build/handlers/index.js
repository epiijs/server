export function declare() {
  return {
    routes: [
      { method: 'GET', path: '/' },
      { method: 'GET', path: '/*' }
    ]
  };
}

export default async function (message) {
  if (message.url === '/') {
    return 'home';
  }
  return { status: 404, content: 'not found: ' + message.url };
}
