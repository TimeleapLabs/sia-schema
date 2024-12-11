# Sia Schema Compiler

A schema compiler for the fastest serializing library.

Don't know what Sia is? Check out the [Github repo](https://github.com/pouya-eghbali/sia).

> ⚠️ This project is still in the early stages of development. Check the [roadmap](#work-in-progress) for more information.

## Installation

```bash
npm install -g sia-schema
```

Or using `npx`:

```bash
npx sia-schema compile sample.sia
```

Add the `--help` flag to see the available options.

## Why a schema compiler?

Sia is a fast serializing library that is used to serialize and deserialize data. It is designed to be used in scenarios where performance is critical, such as in real-time systems or in distributed systems.

However, the library's API is quite raw, and requires some previous knowledge of its API to get even the most basic data types serialized/deserialized.

Check this example:

```javascript
new Sia().addString8("Andrey").addUInt8(25).addAscii("andrey@sia.com").content;
```

Now, imagine you have to do this for every single type, having to deal with nested types, arrays, etc. That's where this schema compiler comes to help.

## Usage

You can write your schema in a `.sia` file, in the following format:

```sia
schema Person {
  name    string8
  age?    int32(min = 0, max = 120)
  email?  text(encoding = "ascii")
}
```

And then run the compiler:

```bash
npx sia compile file.sia
```

This will generate a file with all imports, sample objects, functions and the Sia instance for the schema.

Run `npx sia compile --help` to see the available options.

## Generated code

The generated code is already formatted by prettier for JavaScript and TypeScript.

For Go, the generated code is already formatted by `go fmt`, if Go is installed.

For Python, the generated code is already formatted by `autopep8`, if `autopep8` is installed.

## Work in progress

- [ ] Add support for functions
- [ ] Full schema documentation
