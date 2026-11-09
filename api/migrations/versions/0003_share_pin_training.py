"""share links, pinned chats, training opt-in

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-09 21:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0003'
down_revision: Union[str, None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('shared_chats',
    sa.Column('token', sa.String(length=32), nullable=False),
    sa.Column('conversation_id', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('messages_json', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['conversation_id'], ['conversations.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('token')
    )
    with op.batch_alter_table('shared_chats', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_shared_chats_conversation_id'), ['conversation_id'], unique=True)

    with op.batch_alter_table('conversations', schema=None) as batch_op:
        batch_op.add_column(sa.Column('pinned', sa.Boolean(), server_default=sa.false(), nullable=False))

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('training_opt_in', sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('training_opt_in')

    with op.batch_alter_table('conversations', schema=None) as batch_op:
        batch_op.drop_column('pinned')

    with op.batch_alter_table('shared_chats', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_shared_chats_conversation_id'))

    op.drop_table('shared_chats')
