import fs from 'fs';
const fsPath = '/Users/vamlevord/Developer/rednote-search/src/tools/search.ts';
let code = fs.readFileSync(fsPath, 'utf8');

// Replace the strict filter with a smart fallback
code = code.replace(
  'const results = rawData\n      .filter(note => note.url && note.noteId)\n      .filter(note => note.likes >= minLikes)\n      .sort((a, b) => b.likes - a.likes)\n      .slice(0, limit);',
  `let results = rawData.filter(note => note.url && note.noteId);
    
    // 智能过滤：如果按 minLikes 过滤后结果太少（少于请求 limit 的一半，或少于 3 条），则降低或放弃阈值
    const filteredResults = results.filter(note => note.likes >= minLikes);
    if (minLikes > 0 && filteredResults.length < Math.min(limit / 2, 3)) {
      logger.debug(\`  ⚠️ 满足 minLikes=\${minLikes} 的结果太少 (\${filteredResults.length} 条)，将自动放宽限制\`);
      // 不做 minLikes 过滤，直接使用全部有效结果
    } else {
      results = filteredResults;
    }

    results = results
      .sort((a, b) => b.likes - a.likes)
      .slice(0, limit);`
);

fs.writeFileSync(fsPath, code);
