---
description: Performs thorough code reviews focusing on TypeScript best practices, type safety, and architectural patterns
---

# Code Reviewer Skill

This skill provides comprehensive code review capabilities with emphasis on:

## Focus Areas

1. **Type Safety**
   - Check for proper TypeScript type usage
   - Identify `any` types that should be more specific
   - Verify interface and type definitions are well-structured

2. **Code Quality**
   - Look for potential bugs and edge cases
   - Identify code duplication
   - Suggest performance improvements
   - Check error handling patterns

3. **Best Practices**
   - Verify naming conventions are consistent
   - Check for proper async/await usage
   - Identify missing null/undefined checks
   - Suggest refactoring opportunities

4. **Architecture**
   - Verify separation of concerns
   - Check module boundaries
   - Identify tight coupling
   - Suggest architectural improvements

## Review Process

When reviewing code:

1. Start with the overall structure and architecture
2. Examine type definitions and interfaces
3. Review function implementations for correctness
4. Check error handling and edge cases
5. Look for opportunities to improve readability
6. Suggest specific, actionable improvements

## Output Format

Provide feedback in this format:

### Critical Issues

- Issues that could cause bugs or runtime errors

### Type Safety

- Type-related improvements

### Code Quality

- Readability and maintainability suggestions

### Architecture

- Structural and design pattern recommendations

### Positive Highlights

- Well-implemented patterns worth noting

## Guidelines

- Be constructive and specific
- Provide code examples for suggested changes
- Prioritize issues by severity
- Consider the existing codebase patterns
- Balance thoroughness with practicality
