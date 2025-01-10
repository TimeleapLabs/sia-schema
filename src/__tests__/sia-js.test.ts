import { Extension } from "../generator/common/types.js";
import { generateSia } from "../generator/index.js";
import { compile } from "../index.js";

describe("Sia compilation testing", () => {
  it("should compile a sia file", async () => {
    const input = `
      schema Person {
        name string8
      }
    `;
    const expectedOutput = `
const emptyPerson = {
  name: "",
};

export function serializePerson(sia, obj = emptyPerson) {
  sia.addString8(obj.name);

  return sia;
}

export function deserializePerson(sia) {
  const obj = {
    name: sia.readString8(),
  };

  return obj;
}
`;
    const sir = compile(input);
    const generatedSia = await generateSia(sir, Extension.JS);
    expect(generatedSia).toEqual(expectedOutput.trimStart());
  });

  it("should compile a sia file with different types", async () => {
    const input = `
      schema Person {
        name string8
        age int32
        is_active bool
        created_at int16
      }
    `;
    const expectedOutput = `
const emptyPerson = {
  name: "",
  age: 0,
  is_active: false,
  created_at: 0,
};

export function serializePerson(sia, obj = emptyPerson) {
  sia.addString8(obj.name);
  sia.addInt32(obj.age);
  sia.addBool(obj.is_active);
  sia.addInt16(obj.created_at);

  return sia;
}

export function deserializePerson(sia) {
  const obj = {
    name: sia.readString8(),
    age: sia.readInt32(),
    is_active: sia.readBool(),
    created_at: sia.readInt16(),
  };

  return obj;
}
`;
    const sir = compile(input);
    const generatedSia = await generateSia(sir, Extension.JS);
    expect(generatedSia).toEqual(expectedOutput.trimStart());
  });

  it("should compile a sia file with a nested schema", async () => {
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
const emptyAddress = {
  street: "",
  city: "",
};

const emptyPerson = {
  name: "",
  address: emptyAddress,
};

export function serializeAddress(sia, obj = emptyAddress) {
  sia.addString8(obj.street);
  sia.addString8(obj.city);

  return sia;
}

export function serializePerson(sia, obj = emptyPerson) {
  sia.addString8(obj.name);
  serializeAddress(sia, obj.address);

  return sia;
}

export function deserializeAddress(sia) {
  const obj = {
    street: sia.readString8(),
    city: sia.readString8(),
  };

  return obj;
}

export function deserializePerson(sia) {
  const obj = {
    name: sia.readString8(),
    address: deserializeAddress(sia),
  };

  return obj;
}
`;
    const sir = compile(input);
    const generatedSia = await generateSia(sir, Extension.JS);
    expect(generatedSia).toEqual(expectedOutput.trimStart());
  });

  it("should compile a sia file with a double nested schema", async () => {
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
const emptyCountry = {
  name: "",
};

const emptyAddress = {
  street: "",
  city: "",
  country: emptyCountry,
};

const emptyPerson = {
  name: "",
  address: emptyAddress,
};

export function serializeCountry(sia, obj = emptyCountry) {
  sia.addString8(obj.name);

  return sia;
}

export function serializeAddress(sia, obj = emptyAddress) {
  sia.addString8(obj.street);
  sia.addString8(obj.city);
  serializeCountry(sia, obj.country);

  return sia;
}

export function serializePerson(sia, obj = emptyPerson) {
  sia.addString8(obj.name);
  serializeAddress(sia, obj.address);

  return sia;
}

export function deserializeCountry(sia) {
  const obj = {
    name: sia.readString8(),
  };

  return obj;
}

export function deserializeAddress(sia) {
  const obj = {
    street: sia.readString8(),
    city: sia.readString8(),
    country: deserializeCountry(sia),
  };

  return obj;
}

export function deserializePerson(sia) {
  const obj = {
    name: sia.readString8(),
    address: deserializeAddress(sia),
  };

  return obj;
}
`;
    const sir = compile(input);
    const generatedSia = await generateSia(sir, Extension.JS);
    expect(generatedSia).toEqual(expectedOutput.trimStart());
  });

  it("should compile a sia file with arrays", async () => {
    const input = `
      schema Person {
        name string8
        addresses string16[]
      }
    `;
    const expectedOutput = `
import { serializeString16ArrayItem } from "@timeleap/sia";

const emptyPerson = {
  name: "",
  addresses: [],
};

export function serializePerson(sia, obj = emptyPerson) {
  sia.addString8(obj.name);
  sia.addArray8(obj.addresses, serializeString16ArrayItem);

  return sia;
}

export function deserializePerson(sia) {
  const obj = {
    name: sia.readString8(),
    addresses: sia.readArray8((sia) => {
      return sia.readString16();
    }),
  };

  return obj;
}
`;
    const sir = compile(input);
    const generatedSia = await generateSia(sir, Extension.JS);
    expect(generatedSia).toEqual(expectedOutput.trimStart());
  });

  it("should compile a sia file with an optional field", async () => {
    const input = `
      schema Person {
        name string8
        age? int32
      }
    `;
    const expectedOutput = `
const emptyPerson = {
  name: "",
  age: 0,
};

export function serializePerson(sia, obj = emptyPerson) {
  sia.addString8(obj.name);
  sia.addInt32(obj.age ?? 0);

  return sia;
}

export function deserializePerson(sia) {
  const obj = {
    name: sia.readString8(),
    age: sia.readInt32(),
  };

  return obj;
}
`;
    const sir = compile(input);
    const generatedSia = await generateSia(sir, Extension.JS);
    expect(generatedSia).toEqual(expectedOutput.trimStart());
  });

  it("should compile a sia file with a field with a default value", async () => {
    const input = `
      schema Person {
        name string8
        age int32 = 18
      }
    `;
    const expectedOutput = `
const emptyPerson = {
  name: "",
  age: 18,
};

export function serializePerson(sia, obj = emptyPerson) {
  sia.addString8(obj.name);
  sia.addInt32(obj.age);

  return sia;
}

export function deserializePerson(sia) {
  const obj = {
    name: sia.readString8(),
    age: sia.readInt32(),
  };

  return obj;
}
`;
    const sir = compile(input);
    const generatedSia = await generateSia(sir, Extension.JS);
    expect(generatedSia).toEqual(expectedOutput.trimStart());
  });

  it("should compile a sia file with a range constraint", async () => {
    const input = `
      schema Person {
        name string(min = 0, max = 120)
        age int8
      }
    `;
    const expectedOutput = `
const emptyPerson = {
  name: "",
  age: 0,
};

export function serializePerson(sia, obj = emptyPerson) {
  sia.addString8(obj.name);
  sia.addInt8(obj.age);

  return sia;
}

export function deserializePerson(sia) {
  const obj = {
    name: sia.readString8(),
    age: sia.readInt8(),
  };

  return obj;
}
`;
    const sir = compile(input);
    const generatedSia = await generateSia(sir, Extension.JS);
    expect(generatedSia).toEqual(expectedOutput.trimStart());
  });

  it("should compile a sia file with ascii encoding", async () => {
    const input = `
      schema Person {
        name string8(encoding = "ascii")
      }
    `;
    const expectedOutput = `
const emptyPerson = {
  name: "",
};

export function serializePerson(sia, obj = emptyPerson) {
  sia.addAscii(obj.name);

  return sia;
}

export function deserializePerson(sia) {
  const obj = {
    name: sia.readString8(),
  };

  return obj;
}
`;
    const sir = compile(input);
    const generatedSia = await generateSia(sir, Extension.JS);
    expect(generatedSia).toEqual(expectedOutput.trimStart());
  });

  it("should compile a sia file with an array of strings of a fixed size", async () => {
    const input = `
      schema Person {
        tags8 string8[8]
      }
    `;
    const expectedOutput = `
import { serializeString8ArrayItem } from "@timeleap/sia";

const emptyPerson = {
  tags8: [],
};

export function serializePerson(sia, obj = emptyPerson) {
  sia.addArray8(obj.tags8, serializeString8ArrayItem);

  return sia;
}

export function deserializePerson(sia) {
  const obj = {
    tags8: sia.readArray8((sia) => {
      return sia.readString8();
    }),
  };

  return obj;
}
`;
    const sir = compile(input);
    const generatedSia = await generateSia(sir, Extension.JS);
    expect(generatedSia).toEqual(expectedOutput.trimStart());
  });
});
