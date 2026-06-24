"""add docusign fields to envelopes and signers

Revision ID: e7f1a2b3c4d5
Revises: d3a02f07031f
Create Date: 2026-06-23

"""
from alembic import op
import sqlalchemy as sa

revision = 'e7f1a2b3c4d5'
down_revision = 'd3a02f07031f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- envelopes: ID del sobre en DocuSign --
    op.add_column('envelopes',
        sa.Column('docusign_envelope_id', sa.String(100), nullable=True)
    )

    # -- envelope_signers: tabs de firma para DocuSign --
    op.add_column('envelope_signers',
        sa.Column('sign_here_anchor', sa.String(50), nullable=True)
    )
    op.add_column('envelope_signers',
        sa.Column('full_name_anchor', sa.String(50), nullable=True)
    )
    op.add_column('envelope_signers',
        sa.Column('date_signed_anchor', sa.String(50), nullable=True)
    )
    op.add_column('envelope_signers',
        sa.Column('email_subject', sa.String(255), nullable=True)
    )
    op.add_column('envelope_signers',
        sa.Column('email_blurb', sa.Text(), nullable=True)
    )
    op.add_column('envelope_signers',
        sa.Column('client_user_id', sa.String(100), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('envelope_signers', 'client_user_id')
    op.drop_column('envelope_signers', 'email_blurb')
    op.drop_column('envelope_signers', 'email_subject')
    op.drop_column('envelope_signers', 'date_signed_anchor')
    op.drop_column('envelope_signers', 'full_name_anchor')
    op.drop_column('envelope_signers', 'sign_here_anchor')
    op.drop_column('envelopes', 'docusign_envelope_id')
