from sqlalchemy import inspect, text
from app.db.session import engine, Base

# ✅ Import all models before create_all
from app.models import user, contact, conversation, message, friend_request, call, invite, blocked_user, notification

def create_missing_tables():
    print("Creating missing tables...")
    try:
        Base.metadata.create_all(bind=engine)
        print("✅ Tables created successfully (if missing).")
    except Exception as e:
        print("❌ Error creating tables:", e)

def add_missing_columns():
    inspector = inspect(engine)
    with engine.connect() as conn:
        for table_name, model_table in Base.metadata.tables.items():
            if table_name in inspector.get_table_names():
                existing_cols = [col["name"] for col in inspector.get_columns(table_name)]
                for col_name, col in model_table.columns.items():
                    if col_name not in existing_cols:
                        sql = f'ALTER TABLE "{table_name}" ADD COLUMN "{col_name}" {col.type.compile(engine.dialect)};'
                        print(f"Adding column {table_name}.{col_name}")
                        try:
                            conn.execute(text(sql))
                            conn.commit()
                        except Exception as e:
                            print(f"⚠️ Error adding column {col_name}: {e}")
            else:
                print(f"⚠️ Table {table_name} not found in DB, creating it...")
                try:
                    model_table.create(bind=engine, checkfirst=True)
                except Exception as e:
                    print(f"❌ Error creating {table_name}: {e}")

if __name__ == "__main__":
    print("🔧 Syncing database...")
    create_missing_tables()
    add_missing_columns()
    print("✅ Database sync complete.")
