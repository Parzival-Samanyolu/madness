"""contact messages; cached tokens and cost per usage row

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-14 18:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0004'
down_revision: Union[str, None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('contact_messages',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=True),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('email', sa.String(length=320), nullable=False),
    sa.Column('topic', sa.String(length=32), nullable=False),
    sa.Column('message', sa.Text(), nullable=False),
    sa.Column('handled', sa.Boolean(), server_default=sa.false(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_contact_messages_created_at'), 'contact_messages', ['created_at'], unique=False)
    op.create_index(op.f('ix_contact_messages_user_id'), 'contact_messages', ['user_id'], unique=False)
    with op.batch_alter_table('usage') as b:
        b.add_column(sa.Column('cached_tokens', sa.Integer(), server_default='0', nullable=False))
        b.add_column(sa.Column('cost_usd', sa.Float(), server_default='0', nullable=False))


def downgrade() -> None:
    with op.batch_alter_table('usage') as b:
        b.drop_column('cost_usd')
        b.drop_column('cached_tokens')
    op.drop_index(op.f('ix_contact_messages_user_id'), table_name='contact_messages')
    op.drop_index(op.f('ix_contact_messages_created_at'), table_name='contact_messages')
    op.drop_table('contact_messages')
