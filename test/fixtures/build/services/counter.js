// Process-scoped service
export default function () {
  let count = 0;
  return {
    increment() { return ++count; },
    getCount() { return count; }
  };
}
