"""Validação do contrato comum de identidade e autorização do BLU."""
from __future__ import annotations

import json
from pathlib import Path


ROLE_ORDER = ("viewer", "curator", "admin", "owner")
REQUIRED_CONSTRAINTS = {
    "minimum_enabled_owners": 1,
    "agent_may_elevate_permissions": False,
    "frontend_is_authoritative": False,
    "destructive_actions_require_fresh_confirmation": True,
    "infrastructure_actions_available_to_agent": False,
}


def load_identity_policy(path: Path) -> dict:
    """Carrega e valida a política sem aceitar permissões implícitas."""
    policy = json.loads(path.read_text(encoding="utf-8"))
    if policy.get("schema_version") != 1:
        raise ValueError("Versão da política de identidade não suportada.")
    if policy.get("internal_roles") != list(ROLE_ORDER):
        raise ValueError("A ordem dos papéis internos é inválida.")
    if policy.get("default_role") != "viewer":
        raise ValueError("O papel inicial tem de aplicar privilégio mínimo.")
    if policy.get("external_access") != "revocable_share":
        raise ValueError("Clientes externos não podem receber um papel interno.")

    declared = policy.get("permissions")
    roles = policy.get("roles")
    if not isinstance(declared, list) or not declared or len(declared) != len(set(declared)):
        raise ValueError("A lista de permissões é inválida ou contém duplicados.")
    if not isinstance(roles, dict) or set(roles) != set(ROLE_ORDER):
        raise ValueError("A matriz de papéis está incompleta.")

    known = set(declared)
    previous: set[str] = set()
    for role in ROLE_ORDER:
        permissions = roles[role]
        if not isinstance(permissions, list) or len(permissions) != len(set(permissions)):
            raise ValueError(f"As permissões de {role} são inválidas ou repetidas.")
        current = set(permissions)
        if not current <= known:
            raise ValueError(f"O papel {role} contém permissões não declaradas.")
        if not previous <= current:
            raise ValueError(f"O papel {role} remove permissões do nível anterior.")
        previous = current

    if set(roles["owner"]) != known:
        raise ValueError("O owner tem de cobrir todas as permissões declaradas.")
    if policy.get("constraints") != REQUIRED_CONSTRAINTS:
        raise ValueError("As restrições obrigatórias de autorização foram alteradas.")
    return policy


def allows(policy: dict, role: str, permission: str) -> bool:
    """Decide uma permissão explicitamente; valores desconhecidos são negados."""
    return permission in policy.get("roles", {}).get(role, ())
