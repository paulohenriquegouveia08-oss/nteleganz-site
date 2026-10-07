<?php
/**
 * NT Eleganz — Serviço Transacional de E-mail de Confirmação de Pedido
 * Envia um e-mail com layout de luxo ao cliente após a conclusão do checkout
 */

declare(strict_types=1);

function sendOrderConfirmationEmail(array $order): bool {
    $to = trim((string)($order['customer']['email'] ?? ($order['email'] ?? '')));
    if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
        return false;
    }

    $customerName = trim((string)($order['customer']['name'] ?? ($order['clientName'] ?? 'Cliente')));
    $code = strtoupper(ltrim((string)($order['code'] ?? '#NTE-' . rand(1000, 9999)), '#'));
    $displayCode = '#' . $code;
    $totalValue = (string)($order['value'] ?? 'R$ 0,00');
    $items = is_array($order['items'] ?? null) ? $order['items'] : [];
    $shipping = is_array($order['shipping'] ?? null) ? $order['shipping'] : [];
    $shippingName = $shipping['name'] ?? 'Envio Especial Segurado';
    $shippingPrice = isset($shipping['price']) ? 'R$ ' . number_format((float)$shipping['price'], 2, ',', '.') : 'Incluso';
    $shippingDeadline = $shipping['deadline'] ?? '3 a 7 dias úteis';

    $addr = is_array($order['customer']['address'] ?? null) ? $order['customer']['address'] : [];
    $street = $addr['street'] ?? '';
    $number = $addr['number'] ?? '';
    $comp = !empty($addr['complement']) ? ' (' . $addr['complement'] . ')' : '';
    $neighborhood = $addr['neighborhood'] ?? '';
    $city = $addr['city'] ?? '';
    $state = $addr['state'] ?? '';
    $cep = $addr['cep'] ?? '';
    $fullAddress = trim("{$street}, {$number}{$comp} - {$neighborhood}, {$city}/{$state} - CEP: {$cep}");

    $trackingUrl = "https://nteleganz.com.br/pedido/?code={$code}";

    // Linhas de itens em HTML
    $itemsHtml = '';
    foreach ($items as $item) {
        $pName = htmlspecialchars((string)($item['name'] ?? 'Produto'));
        $pBrand = htmlspecialchars((string)($item['brand'] ?? 'NT Eleganz'));
        $pSize = !empty($item['size']) ? 'Tam: ' . htmlspecialchars((string)$item['size']) : '';
        $pColor = !empty($item['color']) ? ' | ' . htmlspecialchars((string)$item['color']) : '';
        $pQty = (int)($item['qty'] ?? 1);
        $pPrice = htmlspecialchars((string)($item['price'] ?? ''));
        $pImg = (string)($item['image'] ?? '');
        if ($pImg === '' && !empty($item['images'][0])) $pImg = $item['images'][0];
        $imgTag = $pImg !== ''
            ? "<img src=\"" . htmlspecialchars($pImg) . "\" alt=\"{$pName}\" style=\"width:60px;height:75px;object-fit:cover;border-radius:4px;border:1px solid #e5e0d8;margin-right:12px;display:block;\" />"
            : "";

        $itemsHtml .= "
        <tr>
            <td style=\"padding:14px 0;border-bottom:1px solid #f0ede7;vertical-align:middle;\">
                <table cellpadding=\"0\" cellspacing=\"0\" border=\"0\">
                    <tr>
                        <td style=\"vertical-align:middle;\">{$imgTag}</td>
                        <td style=\"vertical-align:middle;\">
                            <div style=\"font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#9b784a;font-weight:600;\">{$pBrand}</div>
                            <div style=\"font-size:14px;color:#0a0a0a;font-weight:600;margin:2px 0;\">{$pName}</div>
                            <div style=\"font-size:12px;color:#666666;\">{$pSize}{$pColor} • Qtd: {$pQty}</div>
                        </td>
                    </tr>
                </table>
            </td>
            <td style=\"padding:14px 0;border-bottom:1px solid #f0ede7;text-align:right;vertical-align:middle;font-size:14px;font-weight:600;color:#0a0a0a;\">
                {$pPrice}
            </td>
        </tr>";
    }

    $subject = "Confirmação do Pedido {$displayCode} — NT Eleganz";

    $htmlBody = <<<HTML
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Confirmação de Pedido - NT Eleganz</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f3ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f3ef;padding:30px 15px;">
    <tr>
      <td align="center">
        <!-- Container Principal -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.06);border:1px solid #ebe6df;">
          
          <!-- Topo Header Nobre -->
          <tr>
            <td style="background-color:#0b1a15;padding:35px 30px;text-align:center;">
              <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;letter-spacing:0.25em;color:#f8f6f0;text-transform:uppercase;font-weight:600;">NT ELEGANZ</div>
              <div style="font-size:10px;letter-spacing:0.35em;color:#c5a880;text-transform:uppercase;margin-top:6px;">LUXURY & ATEMPORAL CURATION</div>
            </td>
          </tr>

          <!-- Mensagem de Boas-vindas -->
          <tr>
            <td style="padding:35px 30px 20px 30px;">
              <div style="display:inline-block;background-color:#f0ebe1;color:#846237;padding:5px 12px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:15px;">
                ✓ Pedido Registrado com Sucesso
              </div>
              <h1 style="margin:0 0 10px 0;font-size:20px;font-weight:600;color:#0b1a15;">Olá, {$customerName}!</h1>
              <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#555555;">
                Agradecemos por sua preferência. Seu pedido foi recebido com sucesso pela curadoria da <strong>NT Eleganz</strong> e já está sendo preparado com todo o cuidado e sofisticação.
              </p>

              <!-- Box Número do Pedido -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#faf8f5;border:1px solid #ebe5dc;border-radius:6px;padding:15px;margin-bottom:25px;">
                <tr>
                  <td>
                    <div style="font-size:11px;color:#8a8a8a;text-transform:uppercase;letter-spacing:0.1em;">Código do Pedido</div>
                    <div style="font-size:18px;font-weight:700;color:#0b1a15;letter-spacing:0.05em;margin-top:2px;">{$displayCode}</div>
                  </td>
                  <td align="right">
                    <div style="font-size:11px;color:#8a8a8a;text-transform:uppercase;letter-spacing:0.1em;">Valor Total</div>
                    <div style="font-size:18px;font-weight:700;color:#122f26;margin-top:2px;">{$totalValue}</div>
                  </td>
                </tr>
              </table>

              <!-- Resumo dos Produtos -->
              <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.15em;font-weight:700;color:#0b1a15;margin-bottom:12px;border-bottom:1px solid #0b1a15;padding-bottom:6px;">
                Peças Selecionadas
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                {$itemsHtml}
              </table>

              <!-- Detalhes de Envio -->
              <div style="margin-top:25px;padding-top:20px;border-top:1px solid #f0ede7;">
                <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.15em;font-weight:700;color:#0b1a15;margin-bottom:10px;">
                  Endereço e Envio
                </div>
                <p style="margin:0 0 6px 0;font-size:13px;color:#333333;line-height:1.5;">
                  <strong>Modalidade:</strong> {$shippingName} ({$shippingDeadline})<br>
                  <strong>Endereço:</strong> {$fullAddress}
                </p>
              </div>

              <!-- Botão de Acompanhamento -->
              <div style="text-align:center;margin-top:35px;margin-bottom:15px;">
                <a href="{$trackingUrl}" target="_blank" style="display:inline-block;background-color:#122f26;color:#ffffff;text-decoration:none;padding:15px 30px;border-radius:4px;font-size:12px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;box-shadow:0 4px 15px rgba(18,47,38,0.2);">
                  Acompanhar Meu Pedido Online
                </a>
              </div>
            </td>
          </tr>

          <!-- Rodapé de Contato -->
          <tr>
            <td style="background-color:#faf8f5;padding:25px 30px;border-top:1px solid #ebe5dc;text-align:center;">
              <p style="margin:0 0 10px 0;font-size:12px;color:#777777;">
                Dúvidas sobre sua entrega ou peças? Fale diretamente com a nossa Concierge no WhatsApp:
              </p>
              <a href="https://wa.me/5575999283496?text=Ola!%20Gostaria%20de%20informacoes%20sobre%20o%20pedido%20{$code}" target="_blank" style="font-size:13px;color:#122f26;font-weight:600;text-decoration:underline;">
                (75) 99928-3496 — Atendimento Exclusivo
              </a>
              <div style="font-size:11px;color:#aaaaaa;margin-top:15px;">
                © NT Eleganz — Todos os direitos reservados.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
HTML;

    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'From: NT Eleganz <contato@nteleganz.com.br>',
        'Reply-To: contato@nteleganz.com.br',
        'X-Mailer: PHP/' . phpversion()
    ];

    return @mail($to, $subject, $htmlBody, implode("\r\n", $headers));
}

// Se chamado diretamente via HTTP POST (Webhook ou teste)
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) {
    header('Content-Type: application/json; charset=utf-8');
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $raw = file_get_contents('php://input');
        $order = $raw ? json_decode($raw, true) : null;
        if (is_array($order)) {
            $sent = sendOrderConfirmationEmail($order);
            echo json_encode(['success' => $sent]);
            exit;
        }
    }
    http_response_code(400);
    echo json_encode(['error' => 'Envie o objeto de pedido em JSON']);
}
