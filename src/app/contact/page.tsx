import ContactForm from "@/components/ContactForm";

export const metadata = { title: "Contact — KinWillow" };

export default function ContactPage() {
  return (
    <main className="page">
      <h1>Contact us</h1>
      <p>
        Questions about KinWillow, the free checklist, or a founding setup session — send a message
        here and we&rsquo;ll reply within one business day. We don&rsquo;t publish an email address,
        to keep it out of the hands of spammers.
      </p>
      <ContactForm />
    </main>
  );
}
