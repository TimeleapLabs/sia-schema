; Keywords
"schema" @keyword

; Boolean literals
(boolean_literal) @boolean

; Schema names
(schema_definition
  name: (identifier) @type)

; Field names
(field_definition
  name: (identifier) @variable.member)

; Type names
(type_expression
  (identifier) @type.builtin)

; Option keys
(option
  key: (identifier) @attribute)

; Option values
(option
  value: (string_literal) @string)

(option
  value: (number_literal) @number)

; Default values
(default_value
  (string_literal) @string)

(default_value
  (number_literal) @number)

; Operators and punctuation
(optional_marker) @operator
(array_marker) @punctuation.bracket
"=" @operator
"," @punctuation.delimiter
"{" @punctuation.bracket
"}" @punctuation.bracket
"(" @punctuation.bracket
")" @punctuation.bracket

; Comments
(comment) @comment
