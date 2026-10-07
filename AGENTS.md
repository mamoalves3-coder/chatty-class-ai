<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- All database access goes through server functions in `src/lib/school.functions.ts` using the service-role client; tables have RLS with no public policies, so lesson theme/description never reach the browser.
- Students have no password: identity is a random token stored in the browser; admin uses a server-signed HMAC token. Why: the brief requires name-only student entry and fixed admin credentials.
- Voice tutor uses browser speech recognition/synthesis with a server-side AI call per turn. Why: simplest working two-way voice loop.
- Live updates use query polling (5s), not realtime. Why: realtime would require exposing hidden lesson fields to the browser.
