# Renderiza a gestão de contas do Monitoring, cuja autorização é validada pelo servidor.
"""Formulários de administração; nunca apresentar hashes ou palavras-passe."""
from html import escape


def render_users(users, actor, csrf):
    rows = []
    for index, user in enumerate(users):
        name = escape(user["username"], quote=True)
        self_user = user["username"].casefold() == actor.casefold()
        hidden = f'<input type="hidden" name="csrf" value="{escape(csrf, quote=True)}"><input type="hidden" name="username" value="{name}">'
        role_options = ''.join(f'<option value="{value}" {"selected" if user["role"] == value else ""}>{label}</option>'
                               for value, label in [("viewer", "Leitor"), ("admin", "Administrador")])
        state_options = ''.join(f'<option value="{value}" {"selected" if user["enabled"] == enabled else ""}>{label}</option>'
                                for value, enabled, label in [("true", True, "Ativo"), ("false", False, "Desativado")])
        own = '<span class="badge">A sua conta</span>' if self_user else ''
        remove = '' if self_user else f'''<details class="account-action danger"><summary>Remover conta</summary>
            <form action="users/manage" method="post">{hidden}<input type="hidden" name="action" value="delete">
            <label class="checkbox-label"><input type="checkbox" name="confirm" value="delete" required> Confirmo a remoção de {name}</label>
            <button type="submit" class="subtle danger-button">Remover definitivamente</button></form></details>'''
        rows.append(f'''<article class="account-card" aria-label="Conta {name}"><div class="account-heading"><div><h2>{name}</h2><p class="muted small">{"Administrador" if user["role"] == "admin" else "Leitor"} · {"Ativo" if user["enabled"] else "Desativado"}</p></div>{own}</div>
            <details class="account-action"><summary>Perfil e estado</summary><form action="users/manage" method="post">{hidden}<input type="hidden" name="action" value="update">
            <label for="role-{index}">Perfil</label><select id="role-{index}" name="role">{role_options}</select><label for="state-{index}">Estado</label><select id="state-{index}" name="enabled">{state_options}</select><button type="submit" class="subtle">Guardar alterações</button></form></details>
            <details class="account-action"><summary>Alterar palavra-passe</summary><form action="users/manage" method="post">{hidden}<input type="hidden" name="action" value="password">
            <label>Nova palavra-passe<input type="password" name="password" autocomplete="new-password" minlength="12" maxlength="128" required></label>
            <label>Confirmar nova palavra-passe<input type="password" name="password_confirm" autocomplete="new-password" minlength="12" maxlength="128" required></label><p class="footnote">As sessões desta conta serão terminadas.</p><button type="submit" class="subtle">Guardar palavra-passe</button></form></details>{remove}</article>''')
    return ''.join(rows)
