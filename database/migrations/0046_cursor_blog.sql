-- Cursor's former RSS URL now serves HTML. Preserve administrator-customized sources.
UPDATE sources
SET kind = 'web_list',
    config = '{"url":"https://cursor.com/zh-Hant/blog","itemSelector":".blog-directory__item","linkSelector":"a.blog-directory__row","titleSelector":"p","publishedAtSelector":"time","allowUrlPrefixes":["https://cursor.com/zh-Hant/blog/"],"itemUrlPrefixRewrite":{"from":"https://cursor.com/zh-Hant/blog/","to":"https://cursor.com/blog/"},"_aihot":{"initialBackfillLimit":8}}'::jsonb,
    updated_at = now()
WHERE id = 'rss-cursor-blog'
  AND kind = 'rss'
  AND config = '{"feedUrl":"https://cursor.com/rss.xml"}'::jsonb;


-- LMSYS moved the blog to www and now renders its cards from client-side data.
UPDATE sources
SET config = '{"url":"https://www.lmsys.org/blog/","adapter":"lmsys_blog","allowUrlPrefixes":["https://www.lmsys.org/blog/"],"_aihot":{"initialBackfillLimit":8}}'::jsonb,
    updated_at = now()
WHERE id = 'web-lmsys-blog'
  AND kind = 'web_list'
  AND config = '{"url":"https://lmsys.org/blog/","allowUrlPrefixes":["https://lmsys.org/blog/"],"_aihot":{"initialBackfillLimit":8}}'::jsonb;