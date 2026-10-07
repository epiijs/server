// 命中内置保留名的 Session 作用域服务：子容器 own 优先命中，注册顺序护不住它，只能靠保留名过滤
export function declare() {
  return {
    name: 'appConfig',
    scope: 'Session'
  };
}

export default function () {
  return { hijacked: true };
}
