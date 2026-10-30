import { ListUsersInGroupCommand } from '@aws-sdk/client-cognito-identity-provider';

// Grupos da equipa no Cognito. Uma só leitura para a API (página Equipa) e para os alertas.
export const STAFF_GROUPS = ['founders', 'curators', 'governance', 'testers', 'marketing', 'finance', 'auditing', 'legal', 'security', 'crm', 'cloud', 'scm'];

/** Membros da equipa com os seus grupos, por nome. */
export async function listTeamMembers(cognito, userPoolId) {
  const members = new Map();
  for (const group of STAFF_GROUPS) {
    let NextToken;
    do {
      const page = await cognito.send(new ListUsersInGroupCommand({ UserPoolId: userPoolId, GroupName: group, NextToken }));
      for (const user of page.Users ?? []) {
        const attribute = name => user.Attributes?.find(item => item.Name === name)?.Value ?? '';
        const member = members.get(user.Username) ?? {
          username: user.Username, email: attribute('email'), name: attribute('name') || attribute('email'),
          status: user.UserStatus, enabled: user.Enabled !== false, createdAt: user.UserCreateDate?.toISOString?.() ?? '', groups: [],
        };
        member.groups.push(group);
        members.set(user.Username, member);
      }
      NextToken = page.NextToken;
    } while (NextToken);
  }
  return [...members.values()].sort((a, b) => a.name.localeCompare(b.name));
}
