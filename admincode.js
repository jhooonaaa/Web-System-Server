import bcrypt from "bcrypt";

const adminCode = "bembang";  

const saltRounds = 10;

bcrypt.hash(adminCode, saltRounds, (err, hashedCode) => {
  if (err) {
    console.error("Error hashing admin code:", err);
  } else {
    console.log("Hashed Admin Code:", hashedCode);
  }
});
