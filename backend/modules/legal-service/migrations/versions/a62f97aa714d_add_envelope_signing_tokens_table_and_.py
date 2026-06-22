"""add envelope signing tokens table and signing provider config

Revision ID: a62f97aa714d
Revises: 425fe54b7106
Create Date: 2026-06-22

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'a62f97aa714d'
down_revision: Union[str, None] = '425fe54b7106'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tabla de tokens para simulación de firma por correo
    op.create_table(
        'envelope_signing_tokens',
        sa.Column('id',           UUID(as_uuid=False), primary_key=True),
        sa.Column('envelope_id',  UUID(as_uuid=False), sa.ForeignKey('envelopes.id', ondelete='CASCADE'), nullable=False),
        sa.Column('signer_id',    UUID(as_uuid=False), sa.ForeignKey('envelope_signers.id', ondelete='CASCADE'), nullable=True),
        sa.Column('signer_name',  sa.String(255), nullable=False),
        sa.Column('signer_email', sa.String(255), nullable=False),
        sa.Column('token',        sa.String(128), nullable=False, unique=True),
        sa.Column('status',       sa.String(30),  nullable=False, server_default='pending'),  # pending | signed | expired
        sa.Column('signed_at',    sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at',   sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at',   sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_signing_tokens_envelope_id', 'envelope_signing_tokens', ['envelope_id'])
    op.create_index('ix_signing_tokens_token',       'envelope_signing_tokens', ['token'], unique=True)

    # Configuración del proveedor de firma — una sola fila
    op.create_table(
        'signing_provider_config',
        sa.Column('id',       sa.Integer(), primary_key=True),
        sa.Column('provider', sa.String(30), nullable=False, server_default='email_sim'),  # email_sim | docusign
        sa.Column('updated_by', UUID(as_uuid=False), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    # Insertar configuración por defecto
    op.execute("INSERT INTO signing_provider_config (id, provider) VALUES (1, 'email_sim')")


def downgrade() -> None:
    op.drop_index('ix_signing_tokens_token',       table_name='envelope_signing_tokens')
    op.drop_index('ix_signing_tokens_envelope_id', table_name='envelope_signing_tokens')
    op.drop_table('envelope_signing_tokens')
    op.drop_table('signing_provider_config')
