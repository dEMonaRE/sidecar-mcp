package com.example;

public class UserService {
    private final Database db;

    public UserService(Database db) {
        this.db = db;
    }

    public User create(String email, String name) {
        if (email == null || email.isEmpty()) {
            throw new IllegalArgumentException("email required");
        }
        User u = new User(email, name);
        db.save(u);
        return u;
    }
}
