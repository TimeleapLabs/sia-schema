# Sia Schema Compiler

A schema compiler for the fastest serializing library.

Don't know what Sia is? Check out the [Github repo](https://github.com/TimeleapLabs/ts-sia).

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
new Sia().addString8("Andrey").addUInt32(25).addAscii("andrey@sia.com").content;
```

Now, imagine you have to do this for every single type, having to deal with nested types, arrays, etc. That's where this schema compiler comes to help.

## Usage

First, you need a schema:

```sia
schema Person {
  name    string8
  age?    int32
  email?  string(encoding = "ascii")
}
```

This will generate the exact same code as above.

## Work in progress

| Language   | Basic Support | Arrays | Hash Maps | Plugins |
| ---------- | ------------- | ------ | --------- | ------- |
| TypeScript | 👍            | ❌     | ❌        | 👍      |
| JavaScript | ❌            | ❌     | ❌        | ❌      |
| Python     | ❌            | ❌     | ❌        | ❌      |
| Go         | ❌            | ❌     | ❌        | ❌      |
| C/C++      | ❌            | ❌     | ❌        | ❌      |
