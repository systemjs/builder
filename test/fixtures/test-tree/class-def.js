class Foo {
  constructor() {
    this.bar = 'bar';
  }
  static get baz() { return 'baz'; }
}

const foo = new Foo();

module.exports = {
  foo: foo,
  barbaz: `${foo.bar}${Foo.baz}`,
};
