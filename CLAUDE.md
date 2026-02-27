# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rednote-Search-MCP is a Model Context Protocol (MCP) server that searches Xiaohongshu (Little Red Book) content and compiles it into structured Markdown travel guides. It uses Playwright for web scraping and supports multiple LLM/VLM providers for content analysis.

## Common Commands

```bash
# Install dependencies (includes Playwright chromium)
npm install

# Build TypeScript
npm run build

# Run tests
npm run test:note-content   # Test note content fetching
npm run test:batch-notes   # Test batch note retrieval
npm run test:images        # Test image downloading

# Development
npm run dev                # Run with ts-node (hot reload)
npm run start              # Run compiled server

# Login (required before first use)
npm run start -- init     # Opens browser for Xiaohongshu login
```

## Architecture

### MCP Server Entry Point
- `src/server.ts` - Main MCP server exposing tools to Claude

### Core Tools (in `src/tools/`)
- `search.ts` - Keyword search with Playwright, extracts likes, supports minLikes filtering
- `batchNotes.ts` - Batch fetches note content from URLs, downloads images locally
- `noteContent.ts` - Fetches individual note details (text, images, metadata)
- `contentJudge.ts` - LLM-powered content sufficiency evaluation
- `vlmAnalyzer.ts` - Image analysis using VLM (supports MiniMax, ZZZ, Jina, Zhipu)
- `auth.ts` - Cookie management for Xiaohongshu login
- `imageDownloader.ts` - Downloads and compresses images
- `favoritesList.ts` - Fetches user's favorite notes

### Test Scripts
- `run_manual_article.ts` - Standalone script for generating travel guides without MCP

## Environment Variables

Create `.env` file for LLM capabilities:
```
MINIMAX_API_KEY=your_minimax_key    # For content judgment
ZZZ_API_KEY=your_zzz_key            # Alternative LLM
ZHIPU_API_KEY=your_zhipu_key        # Alternative LLM
```

## Key Files

- `src/server.ts` - MCP server with 3 main tools: search_notes_by_keyword, batch_get_notes, compile_article
- `run_manual_article.ts` - Direct script to generate Markdown articles from Xiaohongshu content
- `src/types.ts` - TypeScript interfaces for NoteContent, SearchResult, etc.
