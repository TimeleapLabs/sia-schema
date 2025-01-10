import { compile } from "../index.js";

describe("Sir generation testing", () => {
  it("should generate a sir file", () => {
    const input = `
      schema Person {
        name string8
      }
    `;
    const expectedOutput = `
      [
        {
          "name": "Person",
          "type": "schema",
          "fields": [
            {
              "name": "name",
              "type": "string8"
            }
          ]
        }
      ]
    `;
    const output = compile(input);
    expect(output).toEqual(JSON.parse(expectedOutput));
  });

  it("should generate a sir file with different types", () => {
    const input = `
      schema Person {
        name string8
        age int32
        is_active bool
        created_at int16
      }
    `;
    const expectedOutput = `
      [
        {
          "name": "Person",
          "type": "schema",
          "fields": [
            {
              "name": "name",
              "type": "string8"
            },
            {
              "name": "age",
              "type": "int32"
            },
            {
              "name": "is_active",
              "type": "bool"
            },
            {
              "name": "created_at",
              "type": "int16"
            }
          ]
        }
      ]
    `;
    const output = compile(input);
    expect(output).toEqual(JSON.parse(expectedOutput));
  });

  it("should generate a sir file with a nested schema", () => {
    const input = `
      schema Person {
        name string8
        address Address
      }

      schema Address {
        street string8
        city string8
      }
    `;
    const expectedOutput = `
      [
        {
          "name": "Person",
          "type": "schema",
          "fields": [
            {
              "name": "name",
              "type": "string8"
            },
            {
              "name": "address",
              "type": "Address"
            }
          ]
        },
        {
          "name": "Address",
          "type": "schema",
          "fields": [
            {
              "name": "street",
              "type": "string8"
            },
            {
              "name": "city",
              "type": "string8"
            }
          ]
        }
      ]
    `;
    const output = compile(input);
    expect(output).toEqual(JSON.parse(expectedOutput));
  });

  it("should generate a sir file with a double nested schema", () => {
    const input = `
      schema Person {
        name string8
        address Address
      }

      schema Address {
        street string8
        city string8
        country Country
      }

      schema Country {
        name string8
      }
    `;
    const expectedOutput = `
      [
        {
          "name": "Person",
          "type": "schema",
          "fields": [
            {
              "name": "name",
              "type": "string8"
            },
            {
              "name": "address",
              "type": "Address"
            }
          ]
        },
        {
          "name": "Address",
          "type": "schema",
          "fields": [
            {
              "name": "street",
              "type": "string8"
            },
            {
              "name": "city",
              "type": "string8"
            },
            {
              "name": "country",
              "type": "Country"
            }
          ]
        },
        {
          "name": "Country",
          "type": "schema",
          "fields": [
            {
              "name": "name",
              "type": "string8"
            }
          ]
        }
      ]
    `;
    const output = compile(input);
    expect(output).toEqual(JSON.parse(expectedOutput));
  });

  it("should generate a sir file with arrays", () => {
    const input = `
      schema Person {
        name string8
        addresses string16[]
      }
    `;
    const expectedOutput = `
      [
        {
          "name": "Person",
          "type": "schema",
          "fields": [
            {
              "name": "name",
              "type": "string8"
            },
            {
              "name": "addresses",
              "type": "string16",
              "isArray": true
            }
          ]
        }
      ]
    `;
    const output = compile(input);
    expect(output).toEqual(JSON.parse(expectedOutput));
  });

  it("should generate a sir file with an optional field", () => {
    const input = `
      schema Person {
        name string8
        age? int32
      }
    `;
    const expectedOutput = `
      [
        {
          "name": "Person",
          "type": "schema",
          "fields": [
            {
              "name": "name",
              "type": "string8"
            },
            {
              "name": "age",
              "type": "int32",
              "optional": true
            }
          ]
        }
      ]
    `;
    const output = compile(input);
    expect(output).toEqual(JSON.parse(expectedOutput));
  });

  it("should generate a sir file with a field with a default value", () => {
    const input = `
      schema Person {
        name string8
        age int32 = 18
      }
    `;
    const expectedOutput = `
      [
        {
          "name": "Person",
          "type": "schema",
          "fields": [
            {
              "name": "name",
              "type": "string8"
            },
            {
              "name": "age",
              "type": "int32",
              "defaultValue": 18
            }
          ]
        }
      ]
    `;
    const output = compile(input);
    expect(output).toEqual(JSON.parse(expectedOutput));
  });

  it("should generate a sir file with a range constraint", () => {
    const input = `
      schema Person {
        name string(min = 0, max = 120)
        age int8
      }
    `;
    const expectedOutput = `
      [
        {
          "name": "Person",
          "type": "schema",
          "fields": [
            {
              "name": "name",
              "type": "string",
              "min": 0,
              "max": 120
            },
            {
              "name": "age",
              "type": "int8"
            }
          ]
        }
      ]
    `;
    const output = compile(input);
    expect(output).toEqual(JSON.parse(expectedOutput));
  });

  it("should generate a sir file with ascii encoding", () => {
    const input = `
      schema Person {
        name string8(encoding = "ascii")
      }
    `;
    const expectedOutput = `
      [
        {
          "name": "Person",
          "type": "schema",
          "fields": [
            {
              "name": "name",
              "type": "string8",
              "encoding": "ascii"
            }
          ]
        }
      ]
    `;
    const output = compile(input);
    expect(output).toEqual(JSON.parse(expectedOutput));
  });

  it("should generate a sir file with an array of strings of a fixed size", () => {
    const input = `
      schema Person {
        tags8 string8[8]
      }
    `;
    const expectedOutput = `
      [
        {
          "name": "Person",
          "type": "schema",
          "fields": [
            {
              "name": "tags8",
              "type": "string8",
              "isArray": true,
              "arraySize": 8
            }
          ]
        }
      ]
    `;
    const output = compile(input);
    expect(output).toEqual(JSON.parse(expectedOutput));
  });
});
