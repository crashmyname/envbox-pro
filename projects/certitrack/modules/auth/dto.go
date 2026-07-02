package auth

// Request
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type RegisterRequest struct {
	Username string `json:"username" binding:"required,min=3,max=50"`
	Password string `json:"password" binding:"required,min=6"`
	Name     string `json:"name" binding:"required"`
	Email    string `json:"email" binding:"required,email"`
	Section  string `json:"section"`
}

// Response
type LoginResponse struct {
	Token    string `json:"token"`
	Username string `json:"username"`
	Name     string `json:"name"`
	Role     string `json:"role"`
	Section  string `json:"section"`
}

type RegisterResponse struct {
	Message  string `json:"message"`
	Username string `json:"username"`
}
