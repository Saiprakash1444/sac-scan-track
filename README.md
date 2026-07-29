# SAC Scan & Track

sac-inventory



Upgrade



Loading...

I want to build an app for inventory management for my robotics club room. Use a camera-based identification system where components are recognized visually, and their data is fetched from a pre-built database — instead of manually searching or entering details.



And then you layered it with:



🔹 1. Hybrid Identification System Camera scan → identify component If detection fails → manual search fallback The key point: 👉 No typing part numbers by default



Pre-Mapped Component Database Each component already has: Name Specs Quantity Storage location Camera just acts as a query interface, not intelligence-heavy inference



QR Code Integration (your big design fork)



You were debating:



Use existing QR-based inventory apps vs Build your own custom system



And your architecture implicitly became:



👉 Camera recognition + QR code fallback / linking layer



Workflow You Had in Mind

This was the important part most people miss:



User scans component using camera System identifies it (or user selects manually) Database fetches: Details Availability User performs action: Borrow / Return / Check stock System updates inventory



also... i'll need the interface to have this option as well. i should be able to type in the compoenent name and it should point out exactly where it will be located in sac. and if i select a rack, it should tell me what all components are there in that rack. all of these should be options that the user can choose from. and then threre is the logging of who took what and when and sending remidners to return it. and i don't need it knowng where every single ic is... just generally ic box, or resitiros box.. i don tneed it to e super specific when it comes to things that cant be identified like this



So whoever is logged in through their account, theyre name will be shown in the database as the one who took that component.



Best Option (for your use case): Progressive Web App (PWA)



This is what you actually want.



What it means: Runs in browser Works on: Android iPhone Laptop Can be “installed” like an app



Supports:

Camera access



Notifications



You should also have:



🧾 A Central SAC Dashboard (Web Panel)



Runs on a lab computer / tablet



Shows:

Inventory status



Borrowed items



Alerts



So your system becomes:



Users → Phone (PWA)



Admins → Dashboard (Web)

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/88f2366f-47f1-4940-be77-ef9ab12e552c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
