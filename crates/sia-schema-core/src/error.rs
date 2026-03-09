/*!
 * Error types and source location utilities.
 *
 * Provides [`Span`] for tracking byte ranges in source text, [`Diagnostic`]
 * for compiler messages with source locations, and [`LineIndex`] for
 * converting byte offsets to line/column positions (used by the LSP server).
 */

use serde::{Deserialize, Serialize};
use std::fmt;

/** A byte-offset span in the source text. */
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Span {
    /** Byte offset from the start of the source. */
    pub offset: usize,
    /** Length in bytes. */
    pub length: usize,
}

impl Span {
    pub fn new(offset: usize, length: usize) -> Self {
        Self { offset, length }
    }

    /** The end byte offset (exclusive). */
    pub fn end(&self) -> usize {
        self.offset + self.length
    }

    /** Merge two spans into one that covers both. */
    pub fn merge(self, other: Span) -> Span {
        let start = self.offset.min(other.offset);
        let end = self.end().max(other.end());
        Span::new(start, end - start)
    }
}

/** Severity level for a diagnostic message. */
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Error,
    Warning,
    Info,
}

/** A diagnostic message with source location and severity. */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Diagnostic {
    pub message: String,
    pub span: Span,
    pub severity: Severity,
}

impl Diagnostic {
    /** Create an error-level diagnostic. */
    pub fn error(message: impl Into<String>, span: Span) -> Self {
        Self {
            message: message.into(),
            span,
            severity: Severity::Error,
        }
    }

    /** Create a warning-level diagnostic. */
    pub fn warning(message: impl Into<String>, span: Span) -> Self {
        Self {
            message: message.into(),
            span,
            severity: Severity::Warning,
        }
    }
}

impl fmt::Display for Diagnostic {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{:?}: {} (at offset {}, length {})",
            self.severity, self.message, self.span.offset, self.span.length
        )
    }
}

/**
 * A line index for converting byte offsets to line/column positions.
 *
 * Built once from the source text and used by the LSP server to translate
 * byte-offset spans into LSP `Position` values.
 */
#[derive(Debug, Clone)]
pub struct LineIndex {
    /** Byte offsets of the start of each line. */
    line_starts: Vec<usize>,
}

impl LineIndex {
    /** Build a line index from source text. */
    pub fn new(source: &str) -> Self {
        let mut line_starts = vec![0];
        for (i, ch) in source.char_indices() {
            if ch == '\n' {
                line_starts.push(i + 1);
            }
        }
        Self { line_starts }
    }

    /** Convert a byte offset to a (line, column) pair (both 0-based). */
    pub fn line_col(&self, offset: usize) -> (usize, usize) {
        let line = self
            .line_starts
            .partition_point(|&start| start <= offset)
            .saturating_sub(1);
        let col = offset - self.line_starts[line];
        (line, col)
    }

    /** Get the byte offset of a given line start. */
    pub fn line_start(&self, line: usize) -> usize {
        self.line_starts.get(line).copied().unwrap_or(0)
    }

    /** Total number of lines in the source. */
    pub fn line_count(&self) -> usize {
        self.line_starts.len()
    }
}
