p='src/components/ShareProposalModal.tsx'
s=open(p,encoding='utf-8',newline='').read().replace('\r\n','\n')
reps=[
('import { Copy, Mail, Share2, X } from "lucide-react";','import { Copy, Mail, MessageCircle, Share2, X } from "lucide-react";'),
('type ShareResult =','// Endereço da Mission Control (intranet), fixado no build; sem ele, o botão de WhatsApp não aparece.\nconst missionControlUrl = process.env.NEXT_PUBLIC_INTRANET_URL ?? "";\n\ntype ShareResult ='),
('''  const prepareShare = async (event: React.FormEvent) => {
    event.preventDefault();''','''  // O fragmento (#) fica no navegador: o link da proposta não passa pelos servidores da intranet.
  const openMissionControl = (share: ShareResult) => {
    const query = new URLSearchParams({ link: share.shareUrl, v: String(version), dest: destination });
    window.open(`${missionControlUrl.replace(/\/+$/, "")}/#whatsapp?${query}`, "_blank", "noopener");
  };

  const prepareShare = async (event: React.FormEvent) => {
    event.preventDefault();
    const whatsapp =
      Boolean(missionControlUrl) &&
      (event.nativeEvent as SubmitEvent).submitter?.getAttribute("data-channel") === "whatsapp";'''),
('''          recipient,
          retentionDays,''','''          recipient: whatsapp ? "whatsapp" : recipient,
          retentionDays,'''),
('''      openEmail(payload);
''','''      if (whatsapp) openMissionControl(payload);
      else openEmail(payload);
'''),
('''              type="email"
              required''','''              type="email"
              required={!missionControlUrl}'''),
('''              {busy ? "A preparar…" : "Preparar email"}
            </Button>''','''              {busy ? "A preparar…" : "Preparar email"}
            </Button>
            {missionControlUrl && (
              <Button
                type="submit"
                variant="primaryDark"
                disabled={busy || !consent}
                data-channel="whatsapp"
                formNoValidate
              >
                <MessageCircle className="size-4" />
                Enviar por WhatsApp (Mission Control)
              </Button>
            )}'''),
]
for a,b in reps:
    assert s.count(a)==1,(a[:60],s.count(a)); s=s.replace(a,b)
open(p,'w',encoding='utf-8',newline='').write(s)
