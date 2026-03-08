/**
 * @file Tree-sitter grammar for the Sia schema language
 * @author Timeleap
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

export default grammar({
  name: "sia",

  extras: ($) => [/\s/, $.comment],

  rules: {
    source_file: ($) => repeat($.schema_definition),

    // Comments
    comment: (_$) => token(seq("//", /[^\n]*/)),

    // schema Name { ... }
    schema_definition: ($) =>
      seq("schema", field("name", $.identifier), $.schema_body),

    schema_body: ($) => seq("{", repeat($.field_definition), "}"),

    // Field: name? type(options)[] = default
    field_definition: ($) =>
      seq(
        field("name", $.identifier),
        optional($.optional_marker),
        field("type", $.type_expression),
        optional($.default_value),
      ),

    type_expression: ($) =>
      seq($.identifier, optional($.option_list), optional($.array_marker)),

    optional_marker: (_$) => "?",

    array_marker: (_$) => token(seq("[", "]")),

    default_value: ($) => seq("=", $._value),

    // (key = value, ...)
    option_list: ($) => seq("(", commaSep1($.option), ")"),

    option: ($) =>
      seq(field("key", $.identifier), "=", field("value", $._value)),

    // Values
    _value: ($) =>
      choice($.string_literal, $.number_literal, $.boolean_literal),

    string_literal: (_$) => token(seq('"', /[^"]*/, '"')),

    number_literal: (_$) => token(/\d+/),

    boolean_literal: (_$) => choice("true", "false"),

    // Identifiers — keywords inside blocks are valid identifiers
    identifier: (_$) => /[a-zA-Z_][a-zA-Z0-9_]*/,
  },
});

/**
 * Creates a rule for one or more comma-separated occurrences of a rule.
 * @param {Rule} rule
 * @returns {SeqRule}
 */
function commaSep1(rule) {
  return seq(rule, repeat(seq(",", rule)));
}
