<?php

namespace App\Mail;

use App\Models\Prf;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PrfApprovalRequested extends Mailable
{
    use Queueable, SerializesModels;

    public Prf $prf;
    public string $stageLabel;

    public function __construct(Prf $prf, string $stageLabel)
    {
        $this->prf        = $prf;
        $this->stageLabel = $stageLabel;
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "PRF {$this->prf->prf_number} — Awaiting your approval ({$this->stageLabel})",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.prf-approval-requested',
            with: [
                'prf'        => $this->prf,
                'stageLabel' => $this->stageLabel,
                'requester'  => $this->prf->requester?->name ?? 'Unknown',
                'date'       => optional($this->prf->date)->format('d M Y'),
            ],
        );
    }

    public function attachments(): array
    {
        return [];
    }
}
