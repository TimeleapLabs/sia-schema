import type {
  Definition,
  SchemaDefinition,
  PluginDefinition,
  MethodDefinition,
} from "../src/compiler/visitor.js";

export const sampleSiaDefinition: Definition[] = [
  {
    type: "schema",
    name: "Sample",
    fields: [
      { name: "name", type: "string8", optional: false, isArray: false },
      { name: "age", type: "int32", optional: true, isArray: false },
      {
        name: "email",
        type: "string8",
        encoding: "ascii",
        optional: true,
        isArray: true,
      },
      { name: "tags", type: "string8", optional: false, isArray: true },
      {
        name: "test",
        type: "byteN",
        optional: true,
        isArray: false,
        length: 32,
      },
      { name: "test64", type: "byte64", optional: false, isArray: false },
      {
        name: "address",
        type: "SampleAddress",
        optional: false,
        isArray: false,
      },
    ],
  } as SchemaDefinition,
  {
    type: "schema",
    name: "SampleAddress",
    fields: [
      {
        name: "street",
        type: "string8",
        encoding: "ascii",
        optional: true,
        isArray: false,
        defaultValue: "Default Street",
      },
      { name: "city", type: "string8", optional: false, isArray: false },
      { name: "zip", type: "int32", optional: false, isArray: false },
    ],
  } as SchemaDefinition,
  {
    type: "plugin",
    name: "swiss.timeleap.isWizard.v1",
    as: "Sorcery",
    methods: [
      {
        name: "isWizard",
        timeout: "5000",
        fields: [
          { name: "age", type: "uint8", optional: false, isArray: false },
          { name: "name", type: "string8", optional: false, isArray: true },
        ],
        returns: [
          { name: "isWizard", type: "bool", optional: false, isArray: false },
          { name: "message", type: "string8", optional: false, isArray: false },
        ],
      } as MethodDefinition,
    ],
  } as PluginDefinition,
];
