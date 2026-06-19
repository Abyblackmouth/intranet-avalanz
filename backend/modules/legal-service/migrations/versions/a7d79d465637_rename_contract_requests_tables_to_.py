"""rename contract_requests tables to envelopes

Revision ID: a7d79d465637
Revises: fd194ef42a01
Create Date: 2026-06-19

"""
from typing import Sequence, Union
from alembic import op


revision: str = 'a7d79d465637'
down_revision: Union[str, None] = 'fd194ef42a01'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Rename main table
    op.rename_table('contract_requests', 'envelopes')

    # Rename enum type
    op.execute("ALTER TYPE contract_status_enum RENAME TO envelope_status_enum")

    # Rename dependent tables
    op.rename_table('contract_form_snapshots',   'envelope_form_snapshots')
    op.rename_table('contract_status_logs',      'envelope_status_logs')
    op.rename_table('contract_time_tracking',    'envelope_time_tracking')
    op.rename_table('contract_comments',         'envelope_comments')
    op.rename_table('contract_attachments',      'envelope_attachments')
    op.rename_table('contract_attachment_logs',  'envelope_attachment_logs')
    op.rename_table('contract_activity_logs',    'envelope_activity_logs')

    # Rename FK columns: contract_request_id → envelope_id
    op.alter_column('envelope_form_snapshots',  'contract_request_id', new_column_name='envelope_id')
    op.alter_column('envelope_status_logs',     'contract_request_id', new_column_name='envelope_id')
    op.alter_column('envelope_time_tracking',   'contract_request_id', new_column_name='envelope_id')
    op.alter_column('envelope_comments',        'contract_request_id', new_column_name='envelope_id')
    op.alter_column('envelope_attachments',     'contract_request_id', new_column_name='envelope_id')
    op.alter_column('envelope_attachment_logs', 'contract_request_id', new_column_name='envelope_id')
    op.alter_column('envelope_activity_logs',   'contract_request_id', new_column_name='envelope_id')

    # Update bucket default value
    op.execute("UPDATE envelope_attachments SET bucket = 'legal-envelopes' WHERE bucket = 'legal-contracts'")


def downgrade() -> None:
    op.execute("UPDATE envelope_attachments SET bucket = 'legal-contracts' WHERE bucket = 'legal-envelopes'")

    op.alter_column('envelope_activity_logs',   'envelope_id', new_column_name='contract_request_id')
    op.alter_column('envelope_attachment_logs', 'envelope_id', new_column_name='contract_request_id')
    op.alter_column('envelope_attachments',     'envelope_id', new_column_name='contract_request_id')
    op.alter_column('envelope_comments',        'envelope_id', new_column_name='contract_request_id')
    op.alter_column('envelope_time_tracking',   'envelope_id', new_column_name='contract_request_id')
    op.alter_column('envelope_status_logs',     'envelope_id', new_column_name='contract_request_id')
    op.alter_column('envelope_form_snapshots',  'envelope_id', new_column_name='contract_request_id')

    op.rename_table('envelope_activity_logs',  'contract_activity_logs')
    op.rename_table('envelope_attachment_logs','contract_attachment_logs')
    op.rename_table('envelope_attachments',    'contract_attachments')
    op.rename_table('envelope_comments',       'contract_comments')
    op.rename_table('envelope_time_tracking',  'contract_time_tracking')
    op.rename_table('envelope_status_logs',    'contract_status_logs')
    op.rename_table('envelope_form_snapshots', 'contract_form_snapshots')

    op.execute("ALTER TYPE envelope_status_enum RENAME TO contract_status_enum")
    op.rename_table('envelopes', 'contract_requests')
