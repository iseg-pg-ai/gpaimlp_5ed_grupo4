// Guarda do portal: quando o servidor do portal pára (por exemplo, a limpeza automática da conta
// do curso), volta a ligá-lo. Só atua sobre a instância em INSTANCE_ID (regras em guard.mjs).
import { DescribeInstancesCommand, EC2Client, StartInstancesCommand } from '@aws-sdk/client-ec2';
import { createGuard } from './guard.mjs';

const ec2 = new EC2Client({});

export const handler = createGuard({
  instanceId: process.env.INSTANCE_ID,
  describe: async id => (await ec2.send(new DescribeInstancesCommand({ InstanceIds: [id] }))).Reservations?.[0]?.Instances?.[0],
  start: id => ec2.send(new StartInstancesCommand({ InstanceIds: [id] })),
});
