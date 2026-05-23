"""Create demo SQLite database with realistic FK relationships."""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "demo.db"


def main():
    if DB_PATH.exists():
        DB_PATH.unlink()

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.executescript(
        """
        PRAGMA foreign_keys = ON;

        CREATE TABLE departments (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            budget REAL DEFAULT 0
        );

        CREATE TABLE employees (
            id INTEGER PRIMARY KEY,
            full_name TEXT NOT NULL,
            email TEXT UNIQUE,
            department_id INTEGER NOT NULL,
            manager_id INTEGER,
            hired_at TEXT DEFAULT (date('now')),
            FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
            FOREIGN KEY (manager_id) REFERENCES employees(id) ON DELETE SET NULL
        );

        CREATE TABLE projects (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            department_id INTEGER NOT NULL,
            started_at TEXT,
            FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
        );

        CREATE TABLE project_assignments (
            project_id INTEGER NOT NULL,
            employee_id INTEGER NOT NULL,
            role TEXT DEFAULT 'member',
            PRIMARY KEY (project_id, employee_id),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
        );

        CREATE TABLE customers (
            id INTEGER PRIMARY KEY,
            company_name TEXT NOT NULL,
            contact_email TEXT
        );

        CREATE TABLE orders (
            id INTEGER PRIMARY KEY,
            customer_id INTEGER NOT NULL,
            employee_id INTEGER,
            order_date TEXT DEFAULT (date('now')),
            total REAL DEFAULT 0,
            FOREIGN KEY (customer_id) REFERENCES customers(id),
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
        );

        CREATE TABLE order_items (
            id INTEGER PRIMARY KEY,
            order_id INTEGER NOT NULL,
            product_name TEXT NOT NULL,
            quantity INTEGER DEFAULT 1,
            unit_price REAL NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
        );

        INSERT INTO departments (id, name, budget) VALUES
            (1, 'Engineering', 500000),
            (2, 'Sales', 200000);

        INSERT INTO employees (id, full_name, email, department_id, manager_id) VALUES
            (1, 'Alice Chen', 'alice@corp.local', 1, NULL),
            (2, 'Bob Ivanov', 'bob@corp.local', 1, 1),
            (3, 'Carol Smith', 'carol@corp.local', 2, NULL);

        INSERT INTO projects (id, title, department_id) VALUES
            (1, 'Schema Viewer', 1),
            (2, 'CRM Rollout', 2);

        INSERT INTO project_assignments VALUES (1, 1, 'lead'), (1, 2, 'dev'), (2, 3, 'lead');

        INSERT INTO customers (id, company_name) VALUES (1, 'Acme Ltd'), (2, 'Globex');

        INSERT INTO orders (id, customer_id, employee_id, total) VALUES
            (1, 1, 3, 1200.50),
            (2, 2, 3, 450.00);

        INSERT INTO order_items (order_id, product_name, quantity, unit_price) VALUES
            (1, 'License Pro', 1, 999.00),
            (1, 'Support', 1, 201.50),
            (2, 'License Basic', 3, 150.00);
        """
    )

    conn.commit()
    conn.close()
    print(f"Created {DB_PATH}")


if __name__ == "__main__":
    main()
